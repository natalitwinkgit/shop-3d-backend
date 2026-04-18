import { logger } from "../utils/logger.js";

export const notFoundHandler = (req, res) => {
  res.status(404).json({ code: "NOT_FOUND", message: "Route not found" });
};

export const errorHandler = (error, req, res, _next) => {
  const status = Number(error?.status || 500);
  const safeStatus = status >= 400 && status < 600 ? status : 500;

  if (safeStatus >= 500) {
    logger.error("Telegram service request failed", { path: req.originalUrl }, error);
  } else {
    logger.warn("Telegram service request rejected", {
      path: req.originalUrl,
      status: safeStatus,
      message: error.message,
    });
  }

  res.status(safeStatus).json({
    code: error?.code || (safeStatus >= 500 ? "SERVER_ERROR" : "REQUEST_ERROR"),
    message: error?.message || "Internal server error",
  });
};
