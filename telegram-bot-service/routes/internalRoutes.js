import { Router } from "express";

import {
  createBindRequestController,
  createLoginRequestController,
  createRecoveryRequestController,
  getBindRequestController,
  getBindingByUserController,
  getLoginRequestController,
  getRecoveryRequestController,
  redeemLoginRequestController,
  redeemRecoveryRequestController,
  sendCampaignController,
  sendNotificationController,
  sendOrderStatusNotificationController,
  unlinkBindingController,
  updatePreferencesController,
} from "../controllers/internalController.js";
import { requireInternalAuth } from "../middlewares/internalAuth.js";
import { createRateLimit } from "../middlewares/rateLimit.js";

const router = Router();

const sensitiveRateLimit = createRateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many Telegram sensitive requests",
  keyGenerator: (req) =>
    `${req.ip}:${req.body?.websiteUserId || req.params?.websiteUserId || req.params?.requestId || ""}`,
});

router.use(requireInternalAuth);

router.post("/bind-requests", sensitiveRateLimit, createBindRequestController);
router.get("/bind-requests/:requestId", getBindRequestController);

router.get("/bindings/by-user/:websiteUserId", getBindingByUserController);
router.delete("/bindings/by-user/:websiteUserId", sensitiveRateLimit, unlinkBindingController);
router.patch("/bindings/preferences", sensitiveRateLimit, updatePreferencesController);

router.post("/login-requests", sensitiveRateLimit, createLoginRequestController);
router.get("/login-requests/:requestId", getLoginRequestController);
router.post("/login-requests/:requestId/redeem", sensitiveRateLimit, redeemLoginRequestController);

router.post("/recovery-requests", sensitiveRateLimit, createRecoveryRequestController);
router.get("/recovery-requests/:requestId", getRecoveryRequestController);
router.post(
  "/recovery-requests/:requestId/redeem",
  sensitiveRateLimit,
  redeemRecoveryRequestController
);

router.post("/notifications/order-status", sendOrderStatusNotificationController);
router.post("/notifications/event", sendNotificationController);
router.post("/notifications/campaign", sendCampaignController);

export default router;
