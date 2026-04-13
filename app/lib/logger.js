import pino from "pino";

const baseLogger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: null,
  timestamp: pino.stdTimeFunctions.isoTime,
});

const REDACTED_KEYS = new Set([
  "email",
  "phone",
  "token",
  "authorization",
  "password",
  "passwordhash",
  "apiKey",
  "apikey",
  "secret",
  "cookie",
]);

const redactString = (value, key = "") => {
  const raw = String(value || "");
  const normalizedKey = String(key || "").toLowerCase();

  if (normalizedKey.includes("email")) {
    const [local = "", domain = ""] = raw.split("@");
    if (!domain) return "***";
    return `${local.slice(0, 1) || "*"}***@${domain}`;
  }

  if (normalizedKey.includes("phone")) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 4) return "***";
    return `***${digits.slice(-4)}`;
  }

  if (
    normalizedKey.includes("token") ||
    normalizedKey.includes("password") ||
    normalizedKey.includes("secret") ||
    normalizedKey.includes("authorization") ||
    normalizedKey.includes("cookie") ||
    normalizedKey.includes("apikey")
  ) {
    return "[REDACTED]";
  }

  return raw;
};

const sanitizeValue = (value, key = "") => {
  if (value === null || value === undefined) return value;

  const loweredKey = String(key || "").toLowerCase();
  if (typeof value === "string") {
    if (REDACTED_KEYS.has(loweredKey) || loweredKey.includes("email") || loweredKey.includes("phone")) {
      return redactString(value, loweredKey);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, key));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => {
        const childLower = String(childKey || "").toLowerCase();
        if (REDACTED_KEYS.has(childLower) || childLower.includes("token") || childLower.includes("password")) {
          return [childKey, "[REDACTED]"];
        }
        if (childLower.includes("email") && typeof childValue === "string") {
          return [childKey, redactString(childValue, childLower)];
        }
        if (childLower.includes("phone") && typeof childValue === "string") {
          return [childKey, redactString(childValue, childLower)];
        }
        return [childKey, sanitizeValue(childValue, childKey)];
      })
    );
  }

  return value;
};

const withError = (meta = {}, error = null) => {
  const safeMeta = sanitizeValue(meta || {});
  if (!error) return safeMeta;
  return {
    ...(safeMeta || {}),
    err: {
      message: error.message,
      name: error.name,
      stack: error.stack,
    },
  };
};

export const logger = {
  info: (message, meta = {}) => baseLogger.info(sanitizeValue(meta), message),
  warn: (message, meta = {}, error = null) =>
    baseLogger.warn(withError(meta, error), message),
  error: (message, meta = {}, error = null) =>
    baseLogger.error(withError(meta, error), message),
};
