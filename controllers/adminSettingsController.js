import bcrypt from "bcryptjs";

import {
  ensureEmailIsUnique,
  ensurePhoneIsUnique,
  hashPassword,
} from "../admin/lib/adminShared.js";
import User, {
  getStoredPasswordHash,
  isAdminRole,
  isValidPhone,
  normalizePhone,
} from "../models/userModel.js";
import {
  getAdminAiSettingsView,
  updateStoredAiSettings,
} from "../services/aiConfigService.js";
import { splitUserName } from "../services/userProfileService.js";

const pickStr = (value) => String(value ?? "").trim();

const createHttpError = (message, statusCode = 400, raw = null) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (raw) error.raw = raw;
  return error;
};

const getCurrentAdminId = (req) => req.user?._id || req.user?.id || null;

const toAdminMeContract = (userDoc) => {
  const { firstName, lastName } = splitUserName(userDoc?.name);

  return {
    firstName,
    lastName,
    email: pickStr(userDoc?.email),
    phone: pickStr(userDoc?.phone),
    city: pickStr(userDoc?.city),
    role: pickStr(userDoc?.role) || "admin",
    status: pickStr(userDoc?.status) || "active",
  };
};

const toAdminAiContract = (aiView) => {
  const provider = pickStr(aiView?.provider) || "gemini";
  const activeProviderState = provider === "openai" ? aiView?.openai : aiView?.gemini;

  return {
    provider,
    model: pickStr(aiView?.activeModel),
    geminiModel: pickStr(aiView?.gemini?.model),
    openaiModel: pickStr(aiView?.openai?.model),
    hasApiKey: !!activeProviderState?.hasApiKey,
    maskedApiKey: pickStr(activeProviderState?.apiKeyMasked),
  };
};

const buildAdminMePayload = async (req) => {
  const userId = getCurrentAdminId(req);
  if (!userId) {
    throw createHttpError("Unauthorized", 401);
  }

  const user = await User.findById(userId).select(
    "name email phone city role status"
  );
  if (!user) {
    throw createHttpError("User not found", 404);
  }

  if (!isAdminRole(user.role)) {
    throw createHttpError("Forbidden", 403);
  }

  return toAdminMeContract(user);
};

export const getAdminSettingsOverview = async (req, res, next) => {
  try {
    const [me, ai] = await Promise.all([
      buildAdminMePayload(req),
      getAdminAiSettingsView(),
    ]);

    res.json({
      me,
      ai: toAdminAiContract(ai),
    });
  } catch (error) {
    next(error?.statusCode ? error : createHttpError(error?.message || "Failed to load settings", 500, error));
  }
};

export const getMyAdminAccount = async (req, res, next) => {
  try {
    const me = await buildAdminMePayload(req);
    res.json(me);
  } catch (error) {
    next(error?.statusCode ? error : createHttpError(error?.message || "Failed to load account", 500, error));
  }
};

export const updateMyAdminAccount = async (req, res, next) => {
  try {
    const userId = getCurrentAdminId(req);
    if (!userId) {
      throw createHttpError("Unauthorized", 401);
    }

    const user = await User.findById(userId).select("+passwordHash +password");
    if (!user) {
      throw createHttpError("User not found", 404);
    }

    if (req.body?.role !== undefined || req.body?.status !== undefined) {
      throw createHttpError("role and status cannot be edited in this route", 400);
    }

    if (req.body?.name !== undefined) {
      user.name = pickStr(req.body.name);
    } else if (req.body?.firstName !== undefined || req.body?.lastName !== undefined) {
      const currentName = splitUserName(user.name);
      const firstName =
        req.body?.firstName !== undefined
          ? pickStr(req.body.firstName)
          : currentName.firstName;
      const lastName =
        req.body?.lastName !== undefined
          ? pickStr(req.body.lastName)
          : currentName.lastName;
      user.name = `${firstName} ${lastName}`.trim();
    }

    if (req.body?.email !== undefined) {
      const email = pickStr(req.body.email).toLowerCase();
      if (!email) {
        throw createHttpError("Email cannot be empty", 400);
      }

      await ensureEmailIsUnique({ email, excludeUserId: user._id });
      user.email = email;
    }

    if (req.body?.phone !== undefined) {
      const phone = normalizePhone(req.body.phone);
      if (!isValidPhone(phone)) {
        throw createHttpError("Invalid phone number", 400);
      }

      const phoneNormalized = await ensurePhoneIsUnique({
        phone,
        excludeUserId: user._id,
      });

      user.phone = phone;
      user.phoneNormalized = phoneNormalized;
    }

    if (req.body?.city !== undefined) {
      user.city = pickStr(req.body.city);
    }

    const nextPassword = pickStr(req.body?.newPassword || req.body?.password);
    if (nextPassword) {
      if (nextPassword.length < 6) {
        throw createHttpError("Password must contain at least 6 characters", 400);
      }

      const currentPassword = String(req.body?.currentPassword || "");
      if (!currentPassword) {
        throw createHttpError("Current password is required", 400);
      }

      const storedHash = getStoredPasswordHash(user);
      if (!storedHash) {
        throw createHttpError("Current password is not available for verification", 400);
      }

      const isMatch = await bcrypt.compare(currentPassword, storedHash);
      if (!isMatch) {
        throw createHttpError("Current password is invalid", 400);
      }

      user.passwordHash = await hashPassword(nextPassword);
      user.password = "";
    }

    user.updatedBy = user._id;
    await user.save();

    const me = await buildAdminMePayload(req);
    res.json(me);
  } catch (error) {
    next(error?.statusCode ? error : createHttpError(error?.message || "Failed to update account", 500, error));
  }
};

export const getAdminAiSettings = async (_req, res, next) => {
  try {
    const data = await getAdminAiSettingsView();
    res.json(toAdminAiContract(data));
  } catch (error) {
    next(error?.statusCode ? error : createHttpError(error?.message || "Failed to load AI settings", 500, error));
  }
};

export const updateAdminAiSettings = async (req, res, next) => {
  try {
    const payload =
      req.body?.ai && typeof req.body.ai === "object" && !Array.isArray(req.body.ai)
        ? req.body.ai
        : req.body || {};

    const data = await updateStoredAiSettings(payload, req.user);
    res.json(toAdminAiContract(data));
  } catch (error) {
    next(error?.statusCode ? error : createHttpError(error?.message || "Failed to update AI settings", 500, error));
  }
};
