// server/controllers/authController.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ERROR_CODES } from "../app/constants/errorCodes.js";
import { buildRequestFingerprint } from "../app/lib/securityFingerprint.js";
import { logger } from "../app/lib/logger.js";
import { env } from "../config/env.js";
import User, {
  getStoredPasswordHash,
  isValidPhone,
  normalizePhone,
} from "../models/userModel.js";
import {
  buildPublicUserResponse,
  markUserOffline,
} from "../services/userProfileService.js";
import {
  PASSWORD_RESET_PUBLIC_MESSAGE,
  requestPasswordReset,
  resetPasswordWithToken,
} from "../services/passwordResetService.js";

const signToken = (userId, req = null) => {
  const payload = { id: userId };
  if ((env.sessionBindingEnabled || env.sessionBindingMode !== "off") && req) {
    payload.fp = buildRequestFingerprint(req);
  }
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });
};

const pickStr = (value) => String(value || "").trim();

const normalizeEmail = (value) => pickStr(value).toLowerCase();
const sendError = (res, statusCode, code, message) =>
  res.status(statusCode).json({ code, message });

export const registerUser = async (req, res) => {
  const name = pickStr(req.body?.name);
  const email = normalizeEmail(req.body?.email);
  const phone = normalizePhone(req.body?.phone);
  const password = String(req.body?.password || "");
  const confirmPassword = String(req.body?.confirmPassword || "");

  if (!name || !email || !phone || !password) {
    return sendError(
      res,
      400,
      ERROR_CODES.BAD_REQUEST,
      "name, email, phone and password are required"
    );
  }

  if (password.length < 6) {
    return sendError(
      res,
      400,
      ERROR_CODES.BAD_REQUEST,
      "Password must contain at least 6 characters"
    );
  }

  if (confirmPassword && password !== confirmPassword) {
    return sendError(res, 400, ERROR_CODES.BAD_REQUEST, "Passwords do not match");
  }

  if (!isValidPhone(phone)) {
    return sendError(res, 400, ERROR_CODES.BAD_REQUEST, "Invalid phone number");
  }

  try {
    const existing = await User.findOne({
      $or: [{ email }, { phoneNormalized: phone }],
    }).lean();

    if (existing) {
      return sendError(
        res,
        409,
        ERROR_CODES.REQUEST_ERROR,
        "User with this email or phone already exists"
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      phone,
      phoneNormalized: phone,
      passwordHash,
      role: "user",
      status: "active",
      likes: [],
      isOnline: false,
      presence: "offline",
    });

    return res.status(201).json({
      token: signToken(user._id, req),
      user: buildPublicUserResponse(user),
    });
  } catch (error) {
    logger.error("AUTH register failed", {}, error);
    return sendError(res, 500, ERROR_CODES.SERVER_ERROR, "Server error");
  }
};

export const loginUser = async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");

  if (!email || !password) {
    return sendError(res, 400, ERROR_CODES.BAD_REQUEST, "email and password are required");
  }

  try {
    const user = await User.findOne({ email }).select("+passwordHash +password");
    if (!user) {
      return sendError(res, 400, ERROR_CODES.REQUEST_ERROR, "Invalid credentials");
    }

    if (user.status === "banned") {
      return sendError(res, 403, ERROR_CODES.FORBIDDEN, "Your account is banned");
    }

    const storedHash = getStoredPasswordHash(user);
    if (!storedHash) {
      return sendError(res, 400, ERROR_CODES.REQUEST_ERROR, "Invalid credentials");
    }

    const isMatch = await bcrypt.compare(password, storedHash);
    if (!isMatch) {
      return sendError(res, 400, ERROR_CODES.REQUEST_ERROR, "Invalid credentials");
    }

    const now = new Date();
    const update = {
      isOnline: true,
      presence: "online",
      lastSeen: now,
      lastActivityAt: now,
      lastLoginAt: now,
      ...(user.phone ? { phoneNormalized: normalizePhone(user.phone) } : {}),
      ...(user.passwordHash ? {} : { passwordHash: storedHash }),
    };

    await User.updateOne(
      { _id: user._id },
      {
        $set: update,
        ...(user.password ? { $unset: { password: "" } } : {}),
      }
    );

    const freshUser = await User.findById(user._id).select("-passwordHash -password");

    return res.status(200).json({
      token: signToken(user._id, req),
      user: buildPublicUserResponse(freshUser),
    });
  } catch (error) {
    logger.error("AUTH login failed", {}, error);
    return sendError(res, 500, ERROR_CODES.SERVER_ERROR, "Server error");
  }
};

export const getMe = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return sendError(res, 401, ERROR_CODES.UNAUTHORIZED, "Unauthorized");
    }

    const user = await User.findById(req.user.id).select("-passwordHash -password");
    if (!user) {
      return sendError(res, 404, ERROR_CODES.NOT_FOUND, "User not found");
    }

    if (user.status === "banned") {
      return sendError(res, 403, ERROR_CODES.FORBIDDEN, "Your account is banned");
    }

    return res.status(200).json({
      user: buildPublicUserResponse(user),
    });
  } catch (error) {
    logger.error("AUTH me failed", {}, error);
    return sendError(res, 500, ERROR_CODES.SERVER_ERROR, "Server error");
  }
};

export const updateMe = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return sendError(res, 401, ERROR_CODES.UNAUTHORIZED, "Unauthorized");
    }

    const user = await User.findById(req.user.id).select("-passwordHash -password");
    if (!user) {
      return sendError(res, 404, ERROR_CODES.NOT_FOUND, "User not found");
    }

    if (req.body?.name !== undefined) {
      user.name = pickStr(req.body.name);
    }

    if (req.body?.city !== undefined) {
      user.city = pickStr(req.body.city);
    }

    if (req.body?.phone !== undefined) {
      const phone = normalizePhone(req.body.phone);
      if (!isValidPhone(phone)) {
        return sendError(res, 400, ERROR_CODES.BAD_REQUEST, "Invalid phone number");
      }

      const existing = await User.findOne({
        _id: { $ne: user._id },
        phoneNormalized: phone,
      }).lean();

      if (existing) {
        return sendError(
          res,
          409,
          ERROR_CODES.REQUEST_ERROR,
          "User with this phone already exists"
        );
      }

      user.phone = phone;
      user.phoneNormalized = phone;
    }

    user.updatedBy = user._id;
    await user.save();

    return res.json({
      user: buildPublicUserResponse(user),
    });
  } catch (error) {
    logger.error("AUTH updateMe failed", {}, error);
    return sendError(res, 500, ERROR_CODES.SERVER_ERROR, "Server error");
  }
};

export const toggleLike = async (req, res) => {
  const { productId, productName, productCategory, productImage, discount, price } =
    req.body;
  const targetId = productId || req.body._id || req.body.id;

  if (!targetId) {
    return sendError(res, 400, ERROR_CODES.BAD_REQUEST, "productId is required");
  }

  try {
    const user = await User.findById(req.user.id);
    if (!user) return sendError(res, 404, ERROR_CODES.NOT_FOUND, "User not found");

    const index = user.likes.findIndex(
      (like) => String(like.productId) === String(targetId)
    );

    if (index > -1) {
      user.likes.splice(index, 1);
    } else {
      user.likes.push({
        productId: targetId,
        productName: productName || "Unknown",
        productCategory: productCategory || "",
        productImage: productImage || "",
        discount: Number(discount || 0),
        price: Number(price || 0),
      });
    }

    await user.save();
    const updatedUser = await User.findById(req.user.id).select(
      "-passwordHash -password"
    );
    return res.status(200).json(buildPublicUserResponse(updatedUser));
  } catch (error) {
    logger.error("AUTH toggleLike failed", {}, error);
    return sendError(res, 500, ERROR_CODES.SERVER_ERROR, "Server error");
  }
};

export const forgotPassword = async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) {
    return sendError(res, 400, ERROR_CODES.BAD_REQUEST, "Email is required");
  }

  try {
    await requestPasswordReset({ email });
    return res.status(200).json({
      ok: true,
      message: PASSWORD_RESET_PUBLIC_MESSAGE,
    });
  } catch (error) {
    logger.error("AUTH forgotPassword failed", {}, error);
    return sendError(
      res,
      error.statusCode || 500,
      error.code || ERROR_CODES.SERVER_ERROR,
      error.message || "Server error"
    );
  }
};

export const resetPassword = async (req, res) => {
  try {
    await resetPasswordWithToken({
      token: req.body?.token || req.query?.token,
      password: req.body?.password,
      confirmPassword: req.body?.confirmPassword,
    });

    return res.status(200).json({
      ok: true,
      message: "Password has been reset",
    });
  } catch (error) {
    return sendError(
      res,
      error.statusCode || 500,
      error.code || ERROR_CODES.SERVER_ERROR,
      error.message || "Server error"
    );
  }
};

export const logoutUser = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return sendError(res, 401, ERROR_CODES.UNAUTHORIZED, "Unauthorized");
    }

    const user = await markUserOffline(req.user.id, {
      page: req.body?.page || "",
      source: "logout",
    });

    if (!user) return sendError(res, 404, ERROR_CODES.NOT_FOUND, "User not found");

    await User.updateOne(
      { _id: req.user.id },
      { $set: { lastLogoutAt: new Date(), lastSeen: new Date(), lastActivityAt: new Date() } }
    );

    return res.status(200).json({
      ok: true,
      user: buildPublicUserResponse(user),
    });
  } catch (error) {
    logger.error("AUTH logout failed", {}, error);
    return sendError(res, 500, ERROR_CODES.SERVER_ERROR, "Server error");
  }
};
