import { Router } from "express";

import { handleTelegramWebhook } from "../controllers/telegramWebhookController.js";
import { createRateLimit } from "../middlewares/rateLimit.js";

const router = Router();

router.post(
  "/webhook",
  createRateLimit({ windowMs: 60 * 1000, max: 600, message: "Too many Telegram updates" }),
  handleTelegramWebhook
);

export default router;
