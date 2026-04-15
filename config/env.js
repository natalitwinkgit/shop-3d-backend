import dotenv from "dotenv";

dotenv.config();

const toFlag = (value, fallback = false) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "on"].includes(normalized);
};

const normalizeSessionBindingMode = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (["off", "report", "enforce"].includes(normalized)) return normalized;
  return "report";
};

export const env = {
  nodeEnv: String(process.env.NODE_ENV || "development"),
  port: Number(process.env.PORT || 5000),
  mongoUri: String(
    process.env.MONGO_URI || process.env.MONGO_URL || process.env.DATABASE_URL || ""
  ).trim(),
  jwtSecret: String(process.env.JWT_SECRET || "").trim(),
  allowCookieAuth: toFlag(process.env.ALLOW_COOKIE_AUTH, false),
  redisUrl: String(process.env.REDIS_URL || "").trim(),
  sessionBindingMode: normalizeSessionBindingMode(process.env.SESSION_BINDING_MODE),
  sessionBindingEnabled: toFlag(process.env.SESSION_BINDING_ENABLED, false),
  cspEnabled: toFlag(process.env.CSP_ENABLED ?? "true", true),
};
