import { ERROR_CODES } from "../app/constants/errorCodes.js";
import { telegramServiceClient } from "../services/telegramServiceClient.js";

const pickStr = (value) => String(value || "").trim();

const getUserId = (req) => pickStr(req.user?._id || req.user?.id);

const requestTokenFromReq = (req) =>
  pickStr(
    req.headers["x-telegram-request-token"] ||
      req.body?.requestToken ||
      req.query?.requestToken ||
      ""
  );

const userPreviewFromReq = (req) => ({
  name: pickStr(req.user?.name),
  email: pickStr(req.user?.email),
  phone: pickStr(req.user?.phone),
});

const sendMissingUser = (res) =>
  res.status(401).json({ code: ERROR_CODES.UNAUTHORIZED, message: "Unauthorized" });

export const getMyTelegramBinding = async (req, res, next) => {
  try {
    const websiteUserId = getUserId(req);
    if (!websiteUserId) return sendMissingUser(res);

    const result = await telegramServiceClient.getBindingByUser(websiteUserId);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

export const createMyTelegramBindRequest = async (req, res, next) => {
  try {
    const websiteUserId = getUserId(req);
    if (!websiteUserId) return sendMissingUser(res);

    const result = await telegramServiceClient.createBindRequest({
      websiteUserId,
      userPreview: userPreviewFromReq(req),
      metadata: {
        source: "account_settings",
        userAgent: pickStr(req.headers["user-agent"]),
      },
    });

    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
};

export const getMyTelegramBindRequest = async (req, res, next) => {
  try {
    const result = await telegramServiceClient.getBindRequest({
      requestId: req.params.requestId,
      requestToken: requestTokenFromReq(req),
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

export const deleteMyTelegramBinding = async (req, res, next) => {
  try {
    const websiteUserId = getUserId(req);
    if (!websiteUserId) return sendMissingUser(res);

    const result = await telegramServiceClient.unlinkBindingByUser(websiteUserId);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

export const updateMyTelegramNotifications = async (req, res, next) => {
  try {
    const websiteUserId = getUserId(req);
    if (!websiteUserId) return sendMissingUser(res);

    const bindingResult = await telegramServiceClient.getBindingByUser(websiteUserId);
    const telegramUserId = bindingResult?.binding?.telegramUserId;
    if (!telegramUserId) {
      return res.status(404).json({
        code: "TELEGRAM_NOT_LINKED",
        message: "Telegram is not linked",
      });
    }

    const result = await telegramServiceClient.updatePreferences({
      telegramUserId,
      preferences: req.body?.preferences || req.body || {},
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};
