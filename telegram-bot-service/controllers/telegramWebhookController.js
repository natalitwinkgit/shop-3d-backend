import { telegramEnv } from "../config/env.js";
import { handleTelegramUpdate } from "../services/botService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const handleTelegramWebhook = asyncHandler(async (req, res) => {
  const secret = String(req.headers["x-telegram-bot-api-secret-token"] || "").trim();
  if (telegramEnv.webhookSecret && secret !== telegramEnv.webhookSecret) {
    return res.status(401).json({ code: "INVALID_TELEGRAM_WEBHOOK_SECRET" });
  }

  await handleTelegramUpdate(req.body);
  res.json({ ok: true });
});
