import { asyncHandler } from "../utils/asyncHandler.js";
import {
  createActionRequest,
  createBindRequest,
  getRequestStatus,
  redeemActionRequest,
} from "../services/authRequestService.js";
import {
  getActiveBindingByUserId,
  unlinkTelegramBinding,
  updateNotificationPreferences,
} from "../services/bindingService.js";
import {
  sendCampaignNotification,
  sendNotificationToUser,
} from "../services/notificationService.js";

const requestTokenFromReq = (req) =>
  String(
    req.headers["x-telegram-request-token"] ||
      req.body?.requestToken ||
      req.query?.requestToken ||
      ""
  ).trim();

export const createBindRequestController = asyncHandler(async (req, res) => {
  const result = await createBindRequest({
    websiteUserId: req.body?.websiteUserId,
    userPreview: req.body?.userPreview || {},
    metadata: req.body?.metadata || {},
  });
  res.status(201).json(result);
});

export const getBindRequestController = asyncHandler(async (req, res) => {
  const result = await getRequestStatus({
    requestId: req.params.requestId,
    kind: "bind",
    requestToken: requestTokenFromReq(req),
  });
  res.json(result);
});

export const getBindingByUserController = asyncHandler(async (req, res) => {
  const binding = await getActiveBindingByUserId(req.params.websiteUserId);
  res.json({
    linked: Boolean(binding),
    binding: binding
      ? {
          websiteUserId: binding.websiteUserId,
          telegramUserId: binding.telegramUserId,
          username: binding.username,
          firstName: binding.firstName,
          lastName: binding.lastName,
          linkedAt: binding.linkedAt,
          notificationPreferences: binding.notificationPreferences,
        }
      : null,
  });
});

export const unlinkBindingController = asyncHandler(async (req, res) => {
  const binding = await unlinkTelegramBinding({ websiteUserId: req.params.websiteUserId });
  res.json({ ok: true, websiteUserId: binding.websiteUserId, status: binding.status });
});

export const updatePreferencesController = asyncHandler(async (req, res) => {
  const binding = await updateNotificationPreferences({
    telegramUserId: req.body?.telegramUserId,
    preferences: req.body?.preferences,
  });
  res.json({
    ok: true,
    websiteUserId: binding.websiteUserId,
    notificationPreferences: binding.notificationPreferences,
  });
});

export const createLoginRequestController = asyncHandler(async (req, res) => {
  const result = await createActionRequest({
    kind: "login",
    websiteUserId: req.body?.websiteUserId,
    metadata: req.body?.metadata || {},
  });
  res.status(201).json(result);
});

export const getLoginRequestController = asyncHandler(async (req, res) => {
  const result = await getRequestStatus({
    requestId: req.params.requestId,
    kind: "login",
    requestToken: requestTokenFromReq(req),
  });
  res.json(result);
});

export const redeemLoginRequestController = asyncHandler(async (req, res) => {
  const result = await redeemActionRequest({
    requestId: req.params.requestId,
    kind: "login",
    requestToken: requestTokenFromReq(req),
  });
  res.json(result);
});

export const createRecoveryRequestController = asyncHandler(async (req, res) => {
  const result = await createActionRequest({
    kind: "recovery",
    websiteUserId: req.body?.websiteUserId,
    metadata: req.body?.metadata || {},
  });
  res.status(201).json(result);
});

export const getRecoveryRequestController = asyncHandler(async (req, res) => {
  const result = await getRequestStatus({
    requestId: req.params.requestId,
    kind: "recovery",
    requestToken: requestTokenFromReq(req),
  });
  res.json(result);
});

export const redeemRecoveryRequestController = asyncHandler(async (req, res) => {
  const result = await redeemActionRequest({
    requestId: req.params.requestId,
    kind: "recovery",
    requestToken: requestTokenFromReq(req),
  });
  res.json(result);
});

export const sendNotificationController = asyncHandler(async (req, res) => {
  const result = await sendNotificationToUser({
    websiteUserId: req.body?.websiteUserId,
    type: req.body?.type || "service",
    title: req.body?.title || "",
    message: req.body?.message || "",
    payload: req.body?.payload || {},
    url: req.body?.url || "",
  });
  res.status(result.ok ? 202 : 200).json(result);
});

export const sendOrderStatusNotificationController = asyncHandler(async (req, res) => {
  const result = await sendNotificationToUser({
    websiteUserId: req.body?.websiteUserId,
    type: "orderStatus",
    title: "Оновлення замовлення",
    message: req.body?.message || "",
    payload: {
      orderId: req.body?.orderId,
      orderNumber: req.body?.orderNumber,
      status: req.body?.status,
      total: req.body?.total,
      url: req.body?.url,
    },
    url: req.body?.url || "",
  });
  res.status(result.ok ? 202 : 200).json(result);
});

export const sendCampaignController = asyncHandler(async (req, res) => {
  const result = await sendCampaignNotification({
    websiteUserIds: req.body?.websiteUserIds || [],
    type: req.body?.type || "promotions",
    title: req.body?.title || "",
    message: req.body?.message || "",
    payload: req.body?.payload || {},
    url: req.body?.url || "",
  });
  res.status(202).json(result);
});
