import { logger } from "../lib/logger.js";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const adminAuditLogger = (req, res, next) => {
  if (!WRITE_METHODS.has(req.method)) return next();

  const requestId = req.requestId || "-";
  const actorId = String(req.user?._id || req.user?.id || "");
  const actorRole = String(req.user?.role || "");

  const bodyKeys =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? Object.keys(req.body)
      : [];

  res.on("finish", () => {
    logger.info("Admin write audit", {
      requestId,
      actorId: actorId || null,
      actorRole: actorRole || null,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      bodyKeys,
    });
  });

  next();
};
