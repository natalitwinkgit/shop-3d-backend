import { telegramEnv } from "../config/env.js";
import { logger } from "../utils/logger.js";

const buildUrl = (path) => {
  const base = telegramEnv.websiteInternalApiUrl.replace(/\/+$/, "");
  const normalizedPath = String(path || "").startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
};

const requestWebApp = async (path, { method = "GET", body = null } = {}) => {
  if (!telegramEnv.websiteInternalApiUrl) {
    return { ok: false, unavailable: true, data: null };
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
  getProfile: (websiteUserId) =>
    requestWebApp(`/telegram/users/${encodeURIComponent(websiteUserId)}/profile`),
  getOrders: (websiteUserId) =>
    requestWebApp(`/telegram/users/${encodeURIComponent(websiteUserId)}/orders`),
  getDiscount: (websiteUserId) =>
    requestWebApp(`/telegram/users/${encodeURIComponent(websiteUserId)}/discount`),
  getFavorites: (websiteUserId) =>
    requestWebApp(`/telegram/users/${encodeURIComponent(websiteUserId)}/favorites`),
};
