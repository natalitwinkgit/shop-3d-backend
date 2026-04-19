import { ERROR_CODES } from "../app/constants/errorCodes.js";
import { consumeRateLimit } from "../app/lib/rateLimitStore.js";

const DEFAULT_HEADERS = {
  "Cache-Control": "no-store",
};

const pickIp = (req) =>
  String(
    req.ip ||
      req.headers["x-forwarded-for"] ||
      req.socket?.remoteAddress ||
      "unknown"
  ).trim();

const setRateLimitHeaders = (res, limit, remaining, resetAt) => {
  res.set({
    ...DEFAULT_HEADERS,
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(Math.max(0, remaining)),
    "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
  });
};

export const createRateLimit = ({
  windowMs = 15 * 60 * 1000,
  max = 10,
  message = "Too many requests",
  keyGenerator = null,
  skip = null,
} = {}) => {
  return async (req, res, next) => {
    if (typeof skip === "function" && skip(req)) {
      return next();
    }

    const now = Date.now();
    const customKey =
      typeof keyGenerator === "function" ? keyGenerator(req) : "";
    const key = String(customKey || pickIp(req) || "unknown").trim();

    try {
      const state = await consumeRateLimit({ key, windowMs, max });
      setRateLimitHeaders(res, max, state.remaining, state.resetAt);

      if (state.count > max) {
        res.set(
          "Retry-After",
          String(Math.max(1, Math.ceil((state.resetAt - now) / 1000)))
        );
        return res.status(429).json({
          code: ERROR_CODES.TOO_MANY_REQUESTS,
          message,
        });
      }

      return next();
    } catch (error) {
      return res.status(500).json({
        code: ERROR_CODES.SERVER_ERROR,
        message: "Rate limiter internal error",
      });
    }
  };
};
