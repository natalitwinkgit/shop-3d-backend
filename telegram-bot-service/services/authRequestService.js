import mongoose from "mongoose";

import TelegramAuthRequest from "../models/TelegramAuthRequest.js";
import { telegramEnv } from "../config/env.js";
import { createHttpError } from "../utils/httpError.js";
import {
  generateNumericCode,
  generateOpaqueToken,
  hashSecret,
  safeUserId,
  toExpiryDate,
} from "../utils/crypto.js";
import { writeAuditLog } from "./auditService.js";
import {
  bindTelegramAccount,
  getActiveBindingByUserId,
  normalizeTelegramProfile,
} from "./bindingService.js";
import { safeSendTelegramMessage } from "../integrations/telegramApi.js";
import { webAppClient } from "../integrations/webAppClient.js";

const REQUEST_TTL_BY_KIND = {
  bind: () => telegramEnv.bindCodeTtlMinutes,
  login: () => telegramEnv.loginTtlMinutes,
  recovery: () => telegramEnv.recoveryTtlMinutes,
};

const BRAND_NAME = "MebliHub";

const brandTitle = (emoji, title) => `<b>${emoji} ${BRAND_NAME} · ${title}</b>`;

const isExpired = (request) => !request?.expiresAt || new Date(request.expiresAt).getTime() <= Date.now();

const assertRequestToken = (request, requestToken) => {
  if (!request?.requestTokenHash) return;
  if (!requestToken || hashSecret(requestToken) !== request.requestTokenHash) {
    throw createHttpError(401, "Invalid request token", "INVALID_REQUEST_TOKEN");
  }
};

const findRequestById = async ({ requestId, kind }) => {
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    throw createHttpError(404, "Request not found", "REQUEST_NOT_FOUND");
  }

  const request = await TelegramAuthRequest.findOne({ _id: requestId, kind });
  if (!request) throw createHttpError(404, "Request not found", "REQUEST_NOT_FOUND");
  return request;
};

const serializeRequest = (request, extra = {}) => ({
  id: String(request._id || request.id || ""),
  kind: request.kind,
  websiteUserId: request.websiteUserId,
  status: isExpired(request) && request.status === "pending" ? "expired" : request.status,
  expiresAt: request.expiresAt,
  confirmedAt: request.confirmedAt,
  redeemedAt: request.redeemedAt,
  ...extra,
});

export const createBindRequest = async ({ websiteUserId, userPreview = {}, metadata = {} }) => {
  const normalizedUserId = safeUserId(websiteUserId);
  if (!normalizedUserId) {
    throw createHttpError(400, "websiteUserId is required", "WEBSITE_USER_ID_REQUIRED");
  }

  const existingBinding = await getActiveBindingByUserId(normalizedUserId);
  if (existingBinding) {
    throw createHttpError(409, "Telegram is already linked", "TELEGRAM_ALREADY_LINKED");
  }

  const code = generateNumericCode(6);
  const requestToken = generateOpaqueToken(24);
  const expiresAt = toExpiryDate(REQUEST_TTL_BY_KIND.bind());
  const request = await TelegramAuthRequest.create({
    kind: "bind",
    websiteUserId: normalizedUserId,
    requestTokenHash: hashSecret(requestToken),
    codeHash: hashSecret(code),
    expiresAt,
    metadata: { userPreview, ...metadata },
  });

  await writeAuditLog({
    eventType: "bind.request_created",
    websiteUserId: normalizedUserId,
    requestId: String(request._id),
  });

  const deepLink =
    telegramEnv.botUsername && code
      ? `https://t.me/${telegramEnv.botUsername.replace(/^@/, "")}?start=${code}`
      : "";

  return {
    ...serializeRequest(request),
    code,
    requestToken,
    deepLink,
    ttlSeconds: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  };
};

export const confirmBindCode = async ({ code, from, chat }) => {
  const normalizedCode = String(code || "").replace(/\D/g, "");
  if (normalizedCode.length < 4) {
    throw createHttpError(400, "Invalid binding code", "INVALID_BIND_CODE");
  }

  const request = await TelegramAuthRequest.findOne({
    kind: "bind",
    codeHash: hashSecret(normalizedCode),
    status: "pending",
  });

  const telegramProfile = normalizeTelegramProfile(from, chat);

  if (!request) {
    await writeAuditLog({
      eventType: "bind.code_invalid",
      telegramUserId: telegramProfile.telegramUserId,
      chatId: telegramProfile.chatId,
      ok: false,
      reason: "invalid_code",
    });
    throw createHttpError(404, "Binding code was not found", "BIND_CODE_NOT_FOUND");
  }

  request.attemptCount += 1;
  if (request.attemptCount > request.maxAttempts) {
    request.status = "cancelled";
    await request.save();
    throw createHttpError(429, "Too many attempts for this code", "TOO_MANY_CODE_ATTEMPTS");
  }

  if (isExpired(request)) {
    request.status = "expired";
    await request.save();
    throw createHttpError(410, "Binding code expired", "BIND_CODE_EXPIRED");
  }

  const binding = await bindTelegramAccount({
    websiteUserId: request.websiteUserId,
    telegramProfile,
    userPreview: request.metadata?.userPreview || {},
  });

  request.telegramUserId = telegramProfile.telegramUserId;
  request.chatId = telegramProfile.chatId;
  request.status = "confirmed";
  request.confirmedAt = new Date();
  await request.save();

  await writeAuditLog({
    eventType: "bind.code_confirmed",
    websiteUserId: request.websiteUserId,
    telegramUserId: telegramProfile.telegramUserId,
    chatId: telegramProfile.chatId,
    requestId: String(request._id),
  });

  return { request: serializeRequest(request), binding };
};

export const prepareBindCodeConfirmation = async ({ code, from, chat }) => {
  const normalizedCode = String(code || "").replace(/\D/g, "");
  if (normalizedCode.length < 4) {
    throw createHttpError(400, "Invalid binding code", "INVALID_BIND_CODE");
  }

  const telegramProfile = normalizeTelegramProfile(from, chat);
  const request = await TelegramAuthRequest.findOne({
    kind: "bind",
    codeHash: hashSecret(normalizedCode),
    status: "pending",
  });

  if (!request) {
    await writeAuditLog({
      eventType: "bind.code_invalid",
      telegramUserId: telegramProfile.telegramUserId,
      chatId: telegramProfile.chatId,
      ok: false,
      reason: "invalid_code",
    });
    throw createHttpError(404, "Binding code was not found", "BIND_CODE_NOT_FOUND");
  }

  if (isExpired(request)) {
    request.status = "expired";
    await request.save();
    throw createHttpError(410, "Binding code expired", "BIND_CODE_EXPIRED");
  }

  return serializeRequest(request);
};

export const confirmBindCodeWithContact = async ({ code, phone, from, chat }) => {
  const normalizedPhone = String(phone || "").trim();
  if (!normalizedPhone) {
    throw createHttpError(400, "Phone is required", "PHONE_REQUIRED");
  }

  const normalizedCode = String(code || "").replace(/\D/g, "");
  if (normalizedCode.length < 4) {
    throw createHttpError(400, "Invalid binding code", "INVALID_BIND_CODE");
  }

  const request = await TelegramAuthRequest.findOne({
    kind: "bind",
    codeHash: hashSecret(normalizedCode),
    status: "pending",
  });

  const telegramProfile = normalizeTelegramProfile(from, chat);

  if (!request) {
    await writeAuditLog({
      eventType: "bind.code_invalid",
      telegramUserId: telegramProfile.telegramUserId,
      chatId: telegramProfile.chatId,
      ok: false,
      reason: "invalid_code",
    });
    throw createHttpError(404, "Binding code was not found", "BIND_CODE_NOT_FOUND");
  }

  request.attemptCount += 1;
  if (request.attemptCount > request.maxAttempts) {
    request.status = "cancelled";
    await request.save();
    throw createHttpError(429, "Too many attempts for this code", "TOO_MANY_CODE_ATTEMPTS");
  }

  if (isExpired(request)) {
    request.status = "expired";
    await request.save();
    throw createHttpError(410, "Binding code expired", "BIND_CODE_EXPIRED");
  }

  const phoneUpdateResponse = await webAppClient.updateUserPhoneFromTelegram({
    websiteUserId: request.websiteUserId,
    phone: normalizedPhone,
  });

  if (!phoneUpdateResponse.ok) {
    const code =
      phoneUpdateResponse.data?.code ||
      (phoneUpdateResponse.unavailable ? "WEBSITE_API_UNAVAILABLE" : "WEBSITE_PHONE_UPDATE_FAILED");
    const status = phoneUpdateResponse.status || (phoneUpdateResponse.unavailable ? 503 : 502);
    throw createHttpError(
      status,
      phoneUpdateResponse.data?.message || "Failed to update website user phone",
      code
    );
  }

  const userPreview = {
    ...(request.metadata?.userPreview || {}),
    ...(phoneUpdateResponse.data?.userPreview || {}),
  };

  const binding = await bindTelegramAccount({
    websiteUserId: request.websiteUserId,
    telegramProfile,
    userPreview,
  });

  request.telegramUserId = telegramProfile.telegramUserId;
  request.chatId = telegramProfile.chatId;
  request.status = "confirmed";
  request.confirmedAt = new Date();
  request.metadata = {
    ...(request.metadata || {}),
    telegramContactPhone: normalizedPhone,
  };
  await request.save();

  await writeAuditLog({
    eventType: "bind.code_contact_confirmed",
    websiteUserId: request.websiteUserId,
    telegramUserId: telegramProfile.telegramUserId,
    chatId: telegramProfile.chatId,
    requestId: String(request._id),
  });

  return { request: serializeRequest(request), binding };
};

export const confirmBindByPhoneContact = async ({ phone, from, chat }) => {
  const normalizedPhone = String(phone || "").trim();
  if (!normalizedPhone) {
    throw createHttpError(400, "Phone is required", "PHONE_REQUIRED");
  }

  const telegramProfile = normalizeTelegramProfile(from, chat);
  const response = await webAppClient.resolveUserByPhone(normalizedPhone);
  if (!response.ok) {
    const code =
      response.data?.code ||
      (response.unavailable ? "WEBSITE_API_UNAVAILABLE" : "TELEGRAM_PHONE_NOT_FOUND");
    const status = response.status || (response.unavailable ? 503 : 404);
    throw createHttpError(status, response.data?.message || "No account found for this phone", code);
  }

  const websiteUserId = response.data?.websiteUserId;
  if (!websiteUserId) {
    throw createHttpError(502, "Website response does not contain user id", "WEBSITE_USER_ID_MISSING");
  }

  const binding = await bindTelegramAccount({
    websiteUserId,
    telegramProfile,
    userPreview: response.data?.userPreview || { phone: normalizedPhone },
  });

  await writeAuditLog({
    eventType: "bind.contact_confirmed",
    websiteUserId,
    telegramUserId: telegramProfile.telegramUserId,
    chatId: telegramProfile.chatId,
  });

  return { binding };
};

export const getRequestStatus = async ({ requestId, kind, requestToken = "" }) => {
  const request = await findRequestById({ requestId, kind });
  assertRequestToken(request, requestToken);

  if (request.status === "pending" && isExpired(request)) {
    request.status = "expired";
    await request.save();
  }

  return serializeRequest(request);
};

const sendActionRequestToTelegram = async ({ request, binding, kind }) => {
  const actionText =
    kind === "login"
      ? "✅ Підтвердити вхід"
      : "🔐 Підтвердити відновлення";
  const body =
    kind === "login"
      ? [
          brandTitle("🔑", "вхід у кабінет"),
          "Хтось намагається увійти у ваш акаунт через Telegram.",
          "",
          "Якщо це ви, натисніть кнопку нижче. Якщо ні, просто ігноруйте це повідомлення.",
        ].join("\n")
      : [
          brandTitle("🔐", "відновлення доступу"),
          "Отримали запит на відновлення пароля для вашого акаунта.",
          "",
          "Якщо це ви, підтвердьте запит кнопкою нижче.",
        ].join("\n");

  await safeSendTelegramMessage({
    chatId: binding.chatId,
    text: body,
    replyMarkup: {
      inline_keyboard: [
        [
          {
            text: actionText,
            callback_data: `${kind}_confirm:${String(request._id)}`,
          },
        ],
      ],
    },
  });
};

export const createActionRequest = async ({ kind, websiteUserId, metadata = {} }) => {
  if (!["login", "recovery"].includes(kind)) {
    throw createHttpError(400, "Unsupported request kind", "UNSUPPORTED_REQUEST_KIND");
  }

  const normalizedUserId = safeUserId(websiteUserId);
  if (!normalizedUserId) {
    throw createHttpError(400, "websiteUserId is required", "WEBSITE_USER_ID_REQUIRED");
  }

  const binding = await getActiveBindingByUserId(normalizedUserId);
  if (!binding) {
    throw createHttpError(404, "Telegram is not linked", "TELEGRAM_NOT_LINKED");
  }

  const requestToken = generateOpaqueToken(24);
  const request = await TelegramAuthRequest.create({
    kind,
    websiteUserId: normalizedUserId,
    requestTokenHash: hashSecret(requestToken),
    telegramUserId: binding.telegramUserId,
    chatId: binding.chatId,
    expiresAt: toExpiryDate(REQUEST_TTL_BY_KIND[kind]()),
    metadata,
  });

  try {
    await sendActionRequestToTelegram({ request, binding, kind });
  } catch (error) {
    request.status = "cancelled";
    request.metadata = { ...request.metadata, deliveryError: error.message };
    await request.save();
    throw createHttpError(502, "Failed to deliver Telegram request", "TELEGRAM_DELIVERY_FAILED");
  }

  await writeAuditLog({
    eventType: `${kind}.request_created`,
    websiteUserId: normalizedUserId,
    telegramUserId: binding.telegramUserId,
    chatId: binding.chatId,
    requestId: String(request._id),
  });

  return {
    ...serializeRequest(request),
    requestToken,
    ttlSeconds: Math.max(0, Math.floor((request.expiresAt.getTime() - Date.now()) / 1000)),
  };
};

export const confirmActionRequestFromTelegram = async ({ requestId, kind, from, chat }) => {
  const telegramProfile = normalizeTelegramProfile(from, chat);
  const request = await findRequestById({ requestId, kind });

  if (request.status !== "pending") {
    throw createHttpError(409, "Request is not pending", "REQUEST_NOT_PENDING");
  }
  if (isExpired(request)) {
    request.status = "expired";
    await request.save();
    throw createHttpError(410, "Request expired", "REQUEST_EXPIRED");
  }
  if (request.telegramUserId !== telegramProfile.telegramUserId) {
    await writeAuditLog({
      eventType: `${kind}.confirm_rejected`,
      websiteUserId: request.websiteUserId,
      telegramUserId: telegramProfile.telegramUserId,
      chatId: telegramProfile.chatId,
      requestId: String(request._id),
      ok: false,
      reason: "telegram_user_mismatch",
    });
    throw createHttpError(403, "This request belongs to another Telegram account", "REQUEST_OWNER_MISMATCH");
  }

  request.status = "confirmed";
  request.confirmedAt = new Date();
  await request.save();

  await writeAuditLog({
    eventType: `${kind}.confirmed`,
    websiteUserId: request.websiteUserId,
    telegramUserId: telegramProfile.telegramUserId,
    chatId: telegramProfile.chatId,
    requestId: String(request._id),
  });

  return serializeRequest(request);
};

export const redeemActionRequest = async ({ requestId, kind, requestToken }) => {
  const request = await findRequestById({ requestId, kind });
  assertRequestToken(request, requestToken);

  if (request.status === "pending" && isExpired(request)) {
    request.status = "expired";
    await request.save();
  }
  if (request.status !== "confirmed") {
    throw createHttpError(409, "Request is not confirmed", "REQUEST_NOT_CONFIRMED");
  }

  request.status = "redeemed";
  request.redeemedAt = new Date();
  await request.save();

  await writeAuditLog({
    eventType: `${kind}.redeemed`,
    websiteUserId: request.websiteUserId,
    telegramUserId: request.telegramUserId,
    chatId: request.chatId,
    requestId: String(request._id),
  });

  return {
    ...serializeRequest(request),
    websiteUserId: request.websiteUserId,
  };
};
