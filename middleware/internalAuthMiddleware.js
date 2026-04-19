import { env } from "../config/env.js";

const readInternalToken = (req) => {
  const headerToken = String(req.headers["x-internal-api-key"] || "").trim();
  if (headerToken) return headerToken;

  const auth = String(req.headers.authorization || "").trim();
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();

  return "";
};

export const requireInternalAuth = (req, res, next) => {
  if (!env.websiteInternalApiKey) {
    return res.status(503).json({
      code: "INTERNAL_AUTH_NOT_CONFIGURED",
      message: "Website internal API key is not configured",
    });
  }

  const token = readInternalToken(req);
  if (!token || token !== env.websiteInternalApiKey) {
    return res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
  }

  return next();
};
