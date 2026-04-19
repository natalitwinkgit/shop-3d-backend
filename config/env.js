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

const toOptionalPort = (value) => {
  const parsed = Number(value || 0);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

export const env = {
  nodeEnv: String(process.env.NODE_ENV || "development"),
  port: Number(process.env.PORT || 5000),
  mongoUri: String(
    process.env.MONGO_URI || process.env.MONGO_URL || process.env.DATABASE_URL || ""
  ).trim(),
  publicApiUrl: String(
    process.env.PUBLIC_API_URL || process.env.RENDER_EXTERNAL_URL || ""
  ).trim(),
  jwtSecret: String(process.env.JWT_SECRET || "").trim(),
  allowCookieAuth: toFlag(process.env.ALLOW_COOKIE_AUTH, false),
  redisUrl: String(process.env.REDIS_URL || "").trim(),
  publicStoreUrl: String(process.env.PUBLIC_STORE_URL || "").trim(),
  clientUrl: String(process.env.CLIENT_URL || "").trim(),
  passwordResetUrl: String(process.env.PASSWORD_RESET_URL || "").trim(),
  sessionBindingMode: normalizeSessionBindingMode(process.env.SESSION_BINDING_MODE),
  sessionBindingEnabled: toFlag(process.env.SESSION_BINDING_ENABLED, false),
  cspEnabled: toFlag(process.env.CSP_ENABLED ?? "true", true),
  smtp: {
    host: String(process.env.SMTP_HOST || "").trim(),
    port: toOptionalPort(process.env.SMTP_PORT),
    user: String(process.env.SMTP_USER || "").trim(),
    pass: String(process.env.SMTP_PASS || "").trim(),
    from: String(process.env.SMTP_FROM || "").trim(),
    secure:
      String(process.env.SMTP_SECURE || "").trim() === ""
        ? undefined
        : toFlag(process.env.SMTP_SECURE, false),
  },
  // Telegram bot configuration
  telegramBotToken: String(process.env.TELEGRAM_BOT_TOKEN || "").trim(),
  telegramBotEnabled: toFlag(process.env.TELEGRAM_BOT_ENABLED ?? "false", false),
  telegramBotUsername: String(process.env.TELEGRAM_BOT_USERNAME || "").trim(),
  telegramServiceInternalUrl: String(
    process.env.TELEGRAM_SERVICE_INTERNAL_URL ||
      process.env.TELEGRAM_SERVICE_URL ||
      `http://127.0.0.1:${process.env.TELEGRAM_SERVICE_PORT || 5055}/internal`
  ).trim(),
  telegramInternalApiKey: String(process.env.TELEGRAM_INTERNAL_API_KEY || "").trim(),
  websiteInternalApiKey: String(
    process.env.WEBSITE_INTERNAL_API_KEY || process.env.TELEGRAM_INTERNAL_API_KEY || ""
  ).trim(),
  cloudinary: {
    cloudName: String(process.env.CLOUDINARY_CLOUD_NAME || "").trim(),
    apiKey: String(process.env.CLOUDINARY_API_KEY || "").trim(),
    apiSecret: String(process.env.CLOUDINARY_API_SECRET || "").trim(),
  },
};
