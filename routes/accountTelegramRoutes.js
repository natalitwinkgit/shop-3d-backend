import express from "express";

import {
  createMyTelegramBindRequest,
  deleteMyTelegramBinding,
  getMyTelegramBindRequest,
  getMyTelegramBinding,
  updateMyTelegramNotifications,
} from "../controllers/accountTelegramController.js";
import { protect } from "../middleware/authMiddleware.js";
import { createRateLimit } from "../middleware/rateLimitMiddleware.js";

const router = express.Router();

const telegramAccountRateLimit = createRateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many Telegram account requests. Please retry later.",
});

router.use(protect);
router.use(telegramAccountRateLimit);

router.get("/telegram", getMyTelegramBinding);
router.post("/telegram/bind-request", createMyTelegramBindRequest);
router.get("/telegram/bind-request/:requestId", getMyTelegramBindRequest);
router.delete("/telegram", deleteMyTelegramBinding);
router.patch("/telegram/notifications", updateMyTelegramNotifications);

export default router;
