import TelegramBinding from "../models/TelegramBinding.js";
import { createHttpError } from "../utils/httpError.js";
import { safeUserId } from "../utils/crypto.js";
import { writeAuditLog } from "./auditService.js";

export const normalizeTelegramProfile = (from = {}, chat = {}) => ({
  telegramUserId: String(from?.id || "").trim(),
  chatId: String(chat?.id || from?.id || "").trim(),
  username: String(from?.username || "").trim(),
  firstName: String(from?.first_name || "").trim(),
  lastName: String(from?.last_name || "").trim(),
  languageCode: String(from?.language_code || "").trim(),
});

export const getActiveBindingByUserId = async (websiteUserId) => {
  const normalizedUserId = safeUserId(websiteUserId);
  if (!normalizedUserId) return null;
  return TelegramBinding.findOne({ websiteUserId: normalizedUserId, status: "active" }).lean();
};

export const getActiveBindingByTelegramUserId = async (telegramUserId) => {
  const normalizedTelegramUserId = String(telegramUserId || "").trim();
  if (!normalizedTelegramUserId) return null;
  return TelegramBinding.findOne({
    telegramUserId: normalizedTelegramUserId,
    status: "active",
  }).lean();
};

export const bindTelegramAccount = async ({ websiteUserId, telegramProfile, userPreview = {} }) => {
  const normalizedUserId = safeUserId(websiteUserId);
  if (!normalizedUserId) {
    throw createHttpError(400, "websiteUserId is required", "WEBSITE_USER_ID_REQUIRED");
  }
  if (!telegramProfile?.telegramUserId || !telegramProfile?.chatId) {
    throw createHttpError(400, "Telegram profile is required", "TELEGRAM_PROFILE_REQUIRED");
  }

  const existingByTelegram = await TelegramBinding.findOne({
    telegramUserId: telegramProfile.telegramUserId,
    status: "active",
  });
  if (existingByTelegram && existingByTelegram.websiteUserId !== normalizedUserId) {
    await writeAuditLog({
      eventType: "bind.rejected.telegram_already_bound",
      websiteUserId: normalizedUserId,
      telegramUserId: telegramProfile.telegramUserId,
      chatId: telegramProfile.chatId,
      ok: false,
      reason: "telegram_already_bound",
    });
    throw createHttpError(
      409,
      "This Telegram account is already linked to another website account",
      "TELEGRAM_ALREADY_BOUND"
    );
  }

  const existingByUser = await TelegramBinding.findOne({
    websiteUserId: normalizedUserId,
    status: "active",
  });
  if (existingByUser && existingByUser.telegramUserId !== telegramProfile.telegramUserId) {
    await writeAuditLog({
      eventType: "bind.rejected.user_already_bound",
      websiteUserId: normalizedUserId,
      telegramUserId: telegramProfile.telegramUserId,
      chatId: telegramProfile.chatId,
      ok: false,
      reason: "website_user_already_bound",
    });
    throw createHttpError(
      409,
      "This website account is already linked to another Telegram account",
      "WEBSITE_USER_ALREADY_BOUND"
    );
  }

  const binding = await TelegramBinding.findOneAndUpdate(
    { websiteUserId: normalizedUserId },
    {
      $set: {
        websiteUserId: normalizedUserId,
        ...telegramProfile,
        status: "active",
        userPreview,
        linkedAt: new Date(),
        unlinkedAt: null,
        blockedAt: null,
        lastSeenAt: new Date(),
      },
      $setOnInsert: {
        notificationPreferences: {},
      },
    },
    { new: true, upsert: true, runValidators: true }
  );

  await writeAuditLog({
    eventType: "bind.confirmed",
    websiteUserId: normalizedUserId,
    telegramUserId: telegramProfile.telegramUserId,
    chatId: telegramProfile.chatId,
  });

  return binding.toObject?.() || binding;
};

export const unlinkTelegramBinding = async ({ websiteUserId = "", telegramUserId = "" } = {}) => {
  const query = { status: "active" };
  if (websiteUserId) query.websiteUserId = safeUserId(websiteUserId);
  if (telegramUserId) query.telegramUserId = String(telegramUserId).trim();

  const binding = await TelegramBinding.findOneAndUpdate(
    query,
    { status: "unlinked", unlinkedAt: new Date() },
    { new: true }
  );

  if (!binding) {
    throw createHttpError(404, "Telegram binding not found", "BINDING_NOT_FOUND");
  }

  await writeAuditLog({
    eventType: "binding.unlinked",
    websiteUserId: binding.websiteUserId,
    telegramUserId: binding.telegramUserId,
    chatId: binding.chatId,
  });

  return binding.toObject?.() || binding;
};

export const markBindingBlocked = async ({ chatId, telegramUserId, reason = "" }) => {
  const binding = await TelegramBinding.findOneAndUpdate(
    {
      ...(telegramUserId ? { telegramUserId: String(telegramUserId) } : {}),
      ...(chatId ? { chatId: String(chatId) } : {}),
      status: "active",
    },
    { status: "blocked", blockedAt: new Date() },
    { new: true }
  );

  if (binding) {
    await writeAuditLog({
      eventType: "binding.blocked",
      websiteUserId: binding.websiteUserId,
      telegramUserId: binding.telegramUserId,
      chatId: binding.chatId,
      reason,
    });
  }

  return binding;
};

export const updateNotificationPreferences = async ({ telegramUserId, preferences }) => {
  const patch = {};
  for (const [key, value] of Object.entries(preferences || {})) {
    if (typeof value === "boolean") {
      patch[`notificationPreferences.${key}`] = value;
    }
  }

  if (!Object.keys(patch).length) {
    throw createHttpError(400, "No notification preferences provided", "EMPTY_PREFERENCES");
  }

  const binding = await TelegramBinding.findOneAndUpdate(
    { telegramUserId: String(telegramUserId || ""), status: "active" },
    { $set: patch },
    { new: true, runValidators: true }
  );

  if (!binding) throw createHttpError(404, "Telegram binding not found", "BINDING_NOT_FOUND");
  return binding.toObject?.() || binding;
};
