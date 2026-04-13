import { logger } from "../lib/logger.js";

export const requestLogger = (req, _res, next) => {
  if (req.originalUrl.startsWith("/uploads")) return next();

  const startedAt = Date.now();
  const requestId = req.requestId || "-";

  _res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    logger.info("HTTP request completed", {
      method: req.method,
      path: req.originalUrl,
      statusCode: _res.statusCode,
      durationMs,
      requestId,
    });
  });

  next();
};
