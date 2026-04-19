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
import { ensureLoyaltyCard } from "../services/loyaltyService.js";
import {
  PASSWORD_RESET_PUBLIC_MESSAGE,
  requestPasswordReset,
  resetPasswordWithToken,
} from "../services/passwordResetService.js";
import { listUserLikes, toggleUserLike } from "../services/likeService.js";
import { listUserAddresses } from "../services/accountProfileService.js";
import { telegramServiceClient } from "../services/telegramServiceClient.js";

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

const requestTokenFromReq = (req) =>
  pickStr(
    req.headers["x-telegram-request-token"] ||
      req.body?.requestToken ||
      req.query?.requestToken ||
      ""
  );

const addPhoneVariant = (variants, value) => {
  const normalized = normalizePhone(value);
  if (!normalized) return;

  variants.add(normalized);
  const digits = normalized.replace(/\D/g, "");
  if (digits) {
    variants.add(digits);
    variants.add(`+${digits}`);
  }
};

const phoneLookupVariants = (value) => {
  const digits = normalizePhone(value).replace(/\D/g, "");
  const variants = new Set();

  addPhoneVariant(variants, value);
  if (digits.length === 9) {
    addPhoneVariant(variants, `0${digits}`);
    addPhoneVariant(variants, `380${digits}`);
  }
  if (digits.length === 10 && digits.startsWith("0")) {
    addPhoneVariant(variants, digits.slice(1));
    addPhoneVariant(variants, `38${digits}`);
  }
  if (digits.length === 12 && digits.startsWith("380")) {
    addPhoneVariant(variants, digits.slice(3));
    addPhoneVariant(variants, `0${digits.slice(3)}`);
  }

  return [...variants].filter(Boolean);
};

const findUserByLogin = async (login) => {
  const normalizedLogin = pickStr(login);
  if (!normalizedLogin) return null;

  if (normalizedLogin.includes("@")) {
    return User.findOne({ email: normalizeEmail(normalizedLogin) }).select("-passwordHash -password");
  }

  const phoneVariants = phoneLookupVariants(normalizedLogin);
  if (!phoneVariants.length) return null;

  return User.findOne({
    $or: [
      { phoneNormalized: { $in: phoneVariants } },
      { phone: { $in: phoneVariants } },
    ],
  }).select("-passwordHash -password");
};

const buildUserWithRelations = async (userDoc) => {
  const payload = buildPublicUserResponse(userDoc);
  const [likes, addresses] = await Promise.all([
    listUserLikes(userDoc?._id, { legacyLikes: userDoc?.likes || [] }),
    listUserAddresses(userDoc?._id, { legacyAddresses: userDoc?.addresses || [] }),
  ]);

  return {
    ...payload,
    likes,
    likesCount: likes.length,
    addresses,
  };
};

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
    await ensureLoyaltyCard(user._id, { userDoc: user });
    const freshUser = await User.findById(user._id).select("-passwordHash -password");

    return res.status(201).json({
      token: signToken(user._id, req),
      user: await buildUserWithRelations(freshUser || user),
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

    await ensureLoyaltyCard(user._id);
    const freshUser = await User.findById(user._id).select("-passwordHash -password");

    return res.status(200).json({
      token: signToken(user._id, req),
      user: await buildUserWithRelations(freshUser),
    });
  } catch (error) {
    logger.error("AUTH login failed", {}, error);
    return sendError(res, 500, ERROR_CODES.SERVER_ERROR, "Server error");
  }
};

export const createTelegramLoginRequest = async (req, res) => {
  const login = pickStr(req.body?.login || req.body?.email || req.body?.phone);
  if (!login) {
    return sendError(res, 400, ERROR_CODES.BAD_REQUEST, "Email or phone is required");
  }

  try {
    const user = await findUserByLogin(login);
    if (!user) {
      return sendError(res, 404, ERROR_CODES.NOT_FOUND, "User not found");
    }
    if (user.status === "banned") {
      return sendError(res, 403, ERROR_CODES.FORBIDDEN, "Your account is banned");
    }

    const result = await telegramServiceClient.createLoginRequest({
      websiteUserId: String(user._id),
      metadata: {
        source: "login_page",
        userAgent: pickStr(req.headers["user-agent"]),
        loginHint: login.includes("@") ? normalizeEmail(login) : normalizePhone(login),
      },
    });

    return res.status(201).json(result);
  } catch (error) {
    logger.error("AUTH telegram login request failed", {}, error);
    return sendError(
      res,
      error.statusCode || 500,
      error.code || ERROR_CODES.SERVER_ERROR,
      error.message || "Telegram login request failed"
    );
  }
};

export const getTelegramLoginRequest = async (req, res) => {
  try {
    const result = await telegramServiceClient.getLoginRequest({
      requestId: req.params.requestId,
      requestToken: requestTokenFromReq(req),
    });
    return res.json(result);
  } catch (error) {
    return sendError(
      res,
      error.statusCode || 500,
      error.code || ERROR_CODES.SERVER_ERROR,
      error.message || "Telegram login request failed"
    );
  }
};

export const redeemTelegramLoginRequest = async (req, res) => {
  try {
    const result = await telegramServiceClient.redeemLoginRequest({
      requestId: req.params.requestId,
      requestToken: requestTokenFromReq(req),
    });

    const user = await User.findById(result.websiteUserId).select("-passwordHash -password");
    if (!user) {
      return sendError(res, 404, ERROR_CODES.NOT_FOUND, "User not found");
    }
    if (user.status === "banned") {
      return sendError(res, 403, ERROR_CODES.FORBIDDEN, "Your account is banned");
    }

    const now = new Date();
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          isOnline: true,
          presence: "online",
          lastSeen: now,
          lastActivityAt: now,
          lastLoginAt: now,
          ...(user.phone ? { phoneNormalized: normalizePhone(user.phone) } : {}),
        },
      }
    );

    await ensureLoyaltyCard(user._id);
    const freshUser = await User.findById(user._id).select("-passwordHash -password");

    return res.status(200).json({
      token: signToken(user._id, req),
      user: await buildUserWithRelations(freshUser || user),
    });
  } catch (error) {
    logger.error("AUTH telegram login redeem failed", {}, error);
    return sendError(
      res,
      error.statusCode || 500,
      error.code || ERROR_CODES.SERVER_ERROR,
      error.message || "Telegram login failed"
    );
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
    await ensureLoyaltyCard(user._id, { userDoc: user });
    const freshUser = await User.findById(user._id).select("-passwordHash -password");

    return res.status(200).json({
      user: await buildUserWithRelations(freshUser || user),
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
      user: await buildUserWithRelations(user),
    });
  } catch (error) {
    logger.error("AUTH updateMe failed", {}, error);
    return sendError(res, 500, ERROR_CODES.SERVER_ERROR, "Server error");
  }
};

export const toggleLike = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  if (!userId) {
    return sendError(res, 401, ERROR_CODES.UNAUTHORIZED, "Unauthorized");
  }

  const targetId = req.body?.productId || req.body?._id || req.body?.id || req.body?.product;
  if (!targetId) {
    return sendError(res, 400, ERROR_CODES.BAD_REQUEST, "productId is required");
  }

  try {
    const result = await toggleUserLike(userId, req.body || {});
    return res.status(200).json({
      liked: result.liked,
      likes: result.likes,
      user: {
        ...(await buildUserWithRelations(await User.findById(userId).select("-passwordHash -password"))),
        likes: result.likes,
        likesCount: result.likes.length,
      },
    });
  } catch (error) {
    logger.error("AUTH toggleLike failed", {}, error);
    return sendError(res, error.statusCode || 500, ERROR_CODES.SERVER_ERROR, error.message || "Server error");
  }
};

export const listMyLikes = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  if (!userId) {
    return sendError(res, 401, ERROR_CODES.UNAUTHORIZED, "Unauthorized");
  }

  try {
    const user = await User.findById(userId).select("likes").lean();
    const likes = await listUserLikes(userId, { legacyLikes: user?.likes || [] });
    return res.json({ likes, items: likes, total: likes.length });
  } catch (error) {
    logger.error("AUTH listMyLikes failed", {}, error);
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
