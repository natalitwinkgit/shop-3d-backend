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
} = {}) => {
  const store = new Map();

  return (req, res, next) => {
    const now = Date.now();

    if (store.size > 1000) {
      for (const [key, value] of store.entries()) {
        if (!value || value.resetAt <= now) {
          store.delete(key);
        }
      }
    }

    const customKey =
      typeof keyGenerator === "function" ? keyGenerator(req) : "";
    const key = String(customKey || pickIp(req) || "unknown").trim();

    const current = store.get(key);
    if (!current || current.resetAt <= now) {
      const resetAt = now + windowMs;
      store.set(key, { count: 1, resetAt });
      setRateLimitHeaders(res, max, max - 1, resetAt);
      return next();
    }

    current.count += 1;
    setRateLimitHeaders(res, max, max - current.count, current.resetAt);

    if (current.count > max) {
      res.set("Retry-After", String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))));
      return res.status(429).json({ message });
    }

    return next();
  };
};
