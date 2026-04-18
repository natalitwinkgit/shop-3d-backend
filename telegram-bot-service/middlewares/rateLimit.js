const buckets = new Map();

const pickIp = (req) =>
  String(req.ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim();

export const createRateLimit = ({
  windowMs = 60 * 1000,
  max = 30,
  keyGenerator = null,
  message = "Too many requests",
} = {}) => {
  return (req, res, next) => {
    const now = Date.now();
    const key =
      typeof keyGenerator === "function"
        ? String(keyGenerator(req) || "").trim()
        : pickIp(req);
    const bucketKey = key || "unknown";

    if (buckets.size > 5000) {
      for (const [storedKey, value] of buckets.entries()) {
        if (!value || value.resetAt <= now) buckets.delete(storedKey);
      }
    }

    const current = buckets.get(bucketKey);
    if (!current || current.resetAt <= now) {
      buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
      res.set({
        "X-RateLimit-Limit": String(max),
        "X-RateLimit-Remaining": String(Math.max(0, max - 1)),
        "X-RateLimit-Reset": String(Math.ceil((now + windowMs) / 1000)),
      });
      return next();
    }

    current.count += 1;
    res.set({
      "X-RateLimit-Limit": String(max),
      "X-RateLimit-Remaining": String(Math.max(0, max - current.count)),
      "X-RateLimit-Reset": String(Math.ceil(current.resetAt / 1000)),
    });

    if (current.count > max) {
      res.set("Retry-After", String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))));
      return res.status(429).json({ code: "TOO_MANY_REQUESTS", message });
    }

    return next();
  };
};
