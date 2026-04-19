import crypto from "crypto";

import { telegramEnv } from "../config/env.js";

const readInternalToken = (req) => {
  const headerToken = String(req.headers["x-internal-api-key"] || "").trim();
  if (headerToken) return headerToken;

  const auth = String(req.headers.authorization || "").trim();
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();

  return "";
};

export const requireInternalAuth = (req, res, next) => {
  if (!telegramEnv.internalApiKey) {
    return res.status(503).json({
      code: "INTERNAL_AUTH_NOT_CONFIGURED",
      message: "Telegram internal API key is not configured",
    });
  }

  const token = readInternalToken(req);
  const tokenHash = crypto.createHash("sha256").update(token).digest();
  const expectedHash = crypto.createHash("sha256").update(telegramEnv.internalApiKey).digest();
  const validToken = Boolean(token) && crypto.timingSafeEqual(tokenHash, expectedHash);

  if (!validToken) {
    return res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
  }

  return next();
};
