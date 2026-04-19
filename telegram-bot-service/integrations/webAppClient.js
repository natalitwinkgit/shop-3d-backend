import { telegramEnv } from "../config/env.js";
import { logger } from "../utils/logger.js";

const isHeaderSafe = (value) => /^[\t\x20-\x7e\x80-\xff]*$/.test(String(value || ""));

const buildUrl = (path) => {
  const base = telegramEnv.websiteInternalApiUrl.replace(/\/+$/, "");
  const normalizedPath = String(path || "").startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
};

const requestWebApp = async (path, { method = "GET", body = null } = {}) => {
  if (!telegramEnv.websiteInternalApiUrl) {
    return { ok: false, unavailable: true, data: null };
  }

  if (!telegramEnv.websiteInternalApiKey || !isHeaderSafe(telegramEnv.websiteInternalApiKey)) {
    logger.warn("Website internal API key is missing or contains invalid header characters", { path });
    return {
      ok: false,
      unavailable: true,
      status: 503,
      data: {
        code: "WEBSITE_INTERNAL_API_KEY_INVALID",
        message: "Website internal API key must contain only HTTP header-safe characters",
      },
    };
  }

  try {
    const response = await fetch(buildUrl(path), {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Api-Key": telegramEnv.websiteInternalApiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    logger.warn("Website internal API request failed", { path }, error);
    return { ok: false, unavailable: true, data: null };
  }
};

export const webAppClient = {
  resolveUserByPhone: (phone) =>
    requestWebApp("/telegram/users/resolve-by-phone", {
      method: "POST",
      body: { phone },
    }),
  updateUserPhoneFromTelegram: ({ websiteUserId, phone }) =>
    requestWebApp(`/telegram/users/${encodeURIComponent(websiteUserId)}/phone-from-telegram`, {
      method: "PATCH",
      body: { phone },
    }),
  getProfile: (websiteUserId) =>
    requestWebApp(`/telegram/users/${encodeURIComponent(websiteUserId)}/profile`),
  getOrders: (websiteUserId) =>
    requestWebApp(`/telegram/users/${encodeURIComponent(websiteUserId)}/orders`),
  getDiscount: (websiteUserId) =>
    requestWebApp(`/telegram/users/${encodeURIComponent(websiteUserId)}/discount`),
  getFavorites: (websiteUserId) =>
    requestWebApp(`/telegram/users/${encodeURIComponent(websiteUserId)}/favorites`),
  getAddresses: (websiteUserId) =>
    requestWebApp(`/telegram/users/${encodeURIComponent(websiteUserId)}/addresses`),
};
