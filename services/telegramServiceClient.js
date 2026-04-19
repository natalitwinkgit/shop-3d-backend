import { env } from "../config/env.js";

const trim = (value) => String(value || "").trim();
const isHeaderSafe = (value) => /^[\t\x20-\x7e\x80-\xff]*$/.test(String(value || ""));

const buildUrl = (path) => {
  const base = trim(env.telegramServiceInternalUrl).replace(/\/+$/, "");
  if (!base) {
    const error = new Error("Telegram service URL is not configured");
    error.statusCode = 503;
    error.code = "TELEGRAM_SERVICE_NOT_CONFIGURED";
    throw error;
  }
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
};

const requestTelegramService = async (path, { method = "GET", body, requestToken = "" } = {}) => {
  if (!env.telegramInternalApiKey) {
    const error = new Error("Telegram internal API key is not configured");
    error.statusCode = 503;
    error.code = "TELEGRAM_INTERNAL_AUTH_NOT_CONFIGURED";
    throw error;
  }
  if (!isHeaderSafe(env.telegramInternalApiKey)) {
    const error = new Error("Telegram internal API key must contain only HTTP header-safe characters");
    error.statusCode = 503;
    error.code = "TELEGRAM_INTERNAL_AUTH_INVALID";
    throw error;
  }

  const headers = {
    "Content-Type": "application/json",
    "X-Internal-Api-Key": env.telegramInternalApiKey,
    ...(requestToken ? { "X-Telegram-Request-Token": requestToken } : {}),
  };

  const response = await fetch(buildUrl(path), {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.message || "Telegram service request failed");
    error.statusCode = response.status;
    error.code = data?.code || "TELEGRAM_SERVICE_ERROR";
    error.details = data || null;
    throw error;
  }

  return data;
};

export const telegramServiceClient = {
  getBindingByUser: (websiteUserId) =>
    requestTelegramService(`/bindings/by-user/${encodeURIComponent(websiteUserId)}`),

  createBindRequest: ({ websiteUserId, userPreview, metadata }) =>
    requestTelegramService("/bind-requests", {
      method: "POST",
      body: { websiteUserId, userPreview, metadata },
    }),

  getBindRequest: ({ requestId, requestToken }) =>
    requestTelegramService(`/bind-requests/${encodeURIComponent(requestId)}`, { requestToken }),

  unlinkBindingByUser: (websiteUserId) =>
    requestTelegramService(`/bindings/by-user/${encodeURIComponent(websiteUserId)}`, {
      method: "DELETE",
    }),

  updatePreferences: ({ telegramUserId, preferences }) =>
    requestTelegramService("/bindings/preferences", {
      method: "PATCH",
      body: { telegramUserId, preferences },
    }),
};
