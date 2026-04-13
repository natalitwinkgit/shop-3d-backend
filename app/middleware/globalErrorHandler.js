import { ERROR_CODES } from "../constants/errorCodes.js";
import { logger } from "../lib/logger.js";

export const globalErrorHandler = (err, req, res, _next) => {
  const requestId = req.requestId || "-";
  const statusCandidate = Number(err?.statusCode || err?.status || 500);
  const status =
    Number.isInteger(statusCandidate) && statusCandidate >= 400 && statusCandidate <= 599
      ? statusCandidate
      : 500;

  logger.error(
    "Unhandled request error",
    { requestId, path: req.originalUrl, statusCode: status },
    err
  );
  res.status(status).json({
    code:
      err?.code ||
      (status >= 500 ? ERROR_CODES.INTERNAL_ERROR : ERROR_CODES.REQUEST_ERROR),
    message: err?.message || "Server error",
    details: err?.details || null,
    path: req.originalUrl,
    requestId,
    ...(process.env.NODE_ENV === "production" ? {} : { stack: err?.stack }),
  });
};
