import dotenv from "dotenv";

dotenv.config();

const toFlag = (value, fallback = false) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "on"].includes(normalized);
};

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const trim = (value) => String(value || "").trim();

export const telegramEnv = {
  nodeEnv: trim(process.env.NODE_ENV || "development"),
  port: toNumber(process.env.TELEGRAM_SERVICE_PORT || process.env.PORT, 5055),
  mongoUri: trim(
    process.env.TELEGRAM_MONGO_URI ||
      process.env.MONGO_URI ||
      process.env.MONGO_URL ||
      process.env.DATABASE_URL
  ),
  botToken: trim(process.env.TELEGRAM_BOT_TOKEN),
  botUsername: trim(process.env.TELEGRAM_BOT_USERNAME),
  publicWebhookUrl: trim(process.env.TELEGRAM_PUBLIC_WEBHOOK_URL),
  webhookSecret: trim(process.env.TELEGRAM_WEBHOOK_SECRET),
  usePolling: toFlag(process.env.TELEGRAM_USE_POLLING, true),
  internalApiKey: trim(process.env.TELEGRAM_INTERNAL_API_KEY),
  websiteBaseUrl: trim(process.env.WEBSITE_BASE_URL || process.env.CLIENT_URL),
  websiteInternalApiUrl: trim(process.env.WEBSITE_INTERNAL_API_URL),
  websiteInternalApiKey: trim(process.env.WEBSITE_INTERNAL_API_KEY),
  tokenPepper: trim(process.env.TELEGRAM_TOKEN_PEPPER || process.env.JWT_SECRET),
  bindCodeTtlMinutes: toNumber(process.env.TELEGRAM_BIND_CODE_TTL_MINUTES, 10),
  loginTtlMinutes: toNumber(process.env.TELEGRAM_LOGIN_TTL_MINUTES, 5),
  recoveryTtlMinutes: toNumber(process.env.TELEGRAM_RECOVERY_TTL_MINUTES, 10),
};

export const assertTelegramEnv = () => {
  const missing = [];
  if (!telegramEnv.mongoUri) missing.push("TELEGRAM_MONGO_URI or MONGO_URI");
  if (!telegramEnv.botToken) missing.push("TELEGRAM_BOT_TOKEN");
  if (!telegramEnv.internalApiKey) missing.push("TELEGRAM_INTERNAL_API_KEY");
  if (!telegramEnv.tokenPepper) missing.push("TELEGRAM_TOKEN_PEPPER or JWT_SECRET");
  if (missing.length) {
    throw new Error(`Telegram service configuration missing: ${missing.join(", ")}`);
  }
};
