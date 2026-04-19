import TelegramAuditLog from "../models/TelegramAuditLog.js";
import { logger } from "../utils/logger.js";

export const writeAuditLog = async ({
  eventType,
  websiteUserId = "",
  telegramUserId = "",
  chatId = "",
  requestId = "",
  ok = true,
  reason = "",
  meta = {},
} = {}) => {
  try {
    await TelegramAuditLog.create({
      eventType,
      websiteUserId,
      telegramUserId,
      chatId,
      requestId,
      ok,
      reason,
      meta,
    });
  } catch (error) {
    logger.warn("Failed to write Telegram audit log", { eventType, websiteUserId }, error);
  }
};
