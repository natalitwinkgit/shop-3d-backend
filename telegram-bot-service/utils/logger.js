import pino from "pino";

const baseLogger = pino({
  level: process.env.TELEGRAM_LOG_LEVEL || process.env.LOG_LEVEL || "info",
  base: null,
  timestamp: pino.stdTimeFunctions.isoTime,
});

const REDACTED_KEY_PARTS = [
  "token",
  "secret",
  "password",
  "authorization",
  "cookie",
  "apiKey",
  "apikey",
  "code",
];

const maskString = (value, key = "") => {
  const normalizedKey = String(key || "").toLowerCase();
  const raw = String(value || "");

  if (normalizedKey.includes("email")) {
    const [local = "", domain = ""] = raw.split("@");
    return domain ? `${local.slice(0, 1) || "*"}***@${domain}` : "***";
  }

  if (normalizedKey.includes("phone")) {
    const digits = raw.replace(/\D/g, "");
    return digits.length >= 4 ? `***${digits.slice(-4)}` : "***";
  }

  if (REDACTED_KEY_PARTS.some((part) => normalizedKey.includes(part))) {
    return "[REDACTED]";
  }

  return raw;
};

const sanitize = (value, key = "") => {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return maskString(value, key);
  if (Array.isArray(value)) return value.map((item) => sanitize(item, key));

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        sanitize(childValue, childKey),
      ])
    );
  }

  return value;
};

const withError = (meta = {}, error = null) => {
  const safeMeta = sanitize(meta || {});
  if (!error) return safeMeta;
  return {
    ...safeMeta,
    err: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
  };
};

export const logger = {
  info: (message, meta = {}) => baseLogger.info(sanitize(meta), message),
  warn: (message, meta = {}, error = null) => baseLogger.warn(withError(meta, error), message),
  error: (message, meta = {}, error = null) => baseLogger.error(withError(meta, error), message),
};
