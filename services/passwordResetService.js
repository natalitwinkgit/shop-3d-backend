import bcrypt from "bcryptjs";
import crypto from "crypto";

import { ERROR_CODES } from "../app/constants/errorCodes.js";
import { createAppError } from "../app/lib/httpError.js";
import { logger } from "../app/lib/logger.js";
import User from "../models/userModel.js";
import { sendPasswordResetEmail } from "./emailService.js";

export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
export const PASSWORD_RESET_PUBLIC_MESSAGE =
  "If the account exists, reset instructions will be sent";

const pickStr = (value) => String(value || "").trim();
const normalizeEmail = (value) => pickStr(value).toLowerCase();

export const hashPasswordResetToken = (token) =>
  crypto.createHash("sha256").update(String(token || "")).digest("hex");

export const createPasswordResetToken = () => crypto.randomBytes(32).toString("hex");

const createValidationError = (message) =>
  createAppError({
    statusCode: 400,
    code: ERROR_CODES.VALIDATION_ERROR,
    message,
  });

export const requestPasswordReset = async (
  { email } = {},
  {
    userModel = User,
    sendResetEmail = sendPasswordResetEmail,
    now = () => new Date(),
    tokenFactory = createPasswordResetToken,
  } = {}
) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw createValidationError("Email is required");
  }

  const user = await userModel.findOne({ email: normalizedEmail }).select("_id name email status");
  if (!user || user.status === "banned") {
    return { ok: true, emailSent: false };
  }

  const token = tokenFactory();
  const requestedAt = now();
  const expiresAt = new Date(requestedAt.getTime() + PASSWORD_RESET_TOKEN_TTL_MS);
  const tokenHash = hashPasswordResetToken(token);

  user.resetPasswordTokenHash = tokenHash;
  user.resetPasswordExpiresAt = expiresAt;
  user.resetPasswordRequestedAt = requestedAt;
  await user.save();

  const emailResult = await sendResetEmail({ user, token, expiresAt });
  if (!emailResult?.sent) {
    logger.warn("Password reset email was not sent", {
      userId: String(user._id || ""),
      reason: emailResult?.reason || "unknown",
    });
  }

  return { ok: true, emailSent: !!emailResult?.sent };
};

export const resetPasswordWithToken = async (
  { token, password, confirmPassword } = {},
  { userModel = User, now = () => new Date() } = {}
) => {
  const safeToken = pickStr(token);
  const nextPassword = String(password || "");
  const nextConfirmPassword = String(confirmPassword || "");

  if (!safeToken) {
    throw createValidationError("Reset token is required");
  }
  if (!nextPassword || nextPassword.length < 6) {
    throw createValidationError("Password must contain at least 6 characters");
  }
  if (nextConfirmPassword && nextPassword !== nextConfirmPassword) {
    throw createValidationError("Passwords do not match");
  }

  const tokenHash = hashPasswordResetToken(safeToken);
  const currentTime = now();
  const user = await userModel
    .findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpiresAt: { $gt: currentTime },
    })
    .select("+passwordHash +password +resetPasswordTokenHash +resetPasswordExpiresAt");

  if (!user) {
    throw createValidationError("Reset link is invalid or expired");
  }
  if (user.status === "banned") {
    throw createAppError({
      statusCode: 403,
      code: ERROR_CODES.FORBIDDEN,
      message: "Your account is banned",
    });
  }

  user.passwordHash = await bcrypt.hash(nextPassword, 10);
  user.password = undefined;
  user.resetCode = undefined;
  user.resetPasswordTokenHash = "";
  user.resetPasswordExpiresAt = null;
  user.resetPasswordRequestedAt = null;
  user.lastLogoutAt = currentTime;
  user.lastSeen = currentTime;
  user.lastActivityAt = currentTime;

  await user.save();
  return { ok: true };
};
