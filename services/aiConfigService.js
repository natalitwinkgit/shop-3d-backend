import crypto from "crypto";

import Settings from "../models/Settings.js";

export const DEFAULT_AI_PROVIDER = "gemini";
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
export const DEFAULT_OPENAI_MODEL = "gpt-5-mini";

const SETTINGS_KEY = "global";

const pickStr = (value) => String(value ?? "").trim();

const toBool = (value) =>
  value === true || String(value || "").trim().toLowerCase() === "true" || String(value || "").trim() === "1";

const createServiceError = (message, statusCode = 400, raw = null) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (raw) error.raw = raw;
  return error;
};

export const normalizeAiProvider = (value) => {
  const normalized = pickStr(value).toLowerCase();
  if (normalized === "gemini" || normalized === "openai") return normalized;
  return "";
};

const maskSecret = (value) => {
  const secret = pickStr(value);
  if (!secret) return "";
  if (secret.length <= 8) return `${secret.slice(0, 2)}***${secret.slice(-2)}`;
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
};

const getEncryptionSecret = () =>
  pickStr(process.env.SETTINGS_ENCRYPTION_KEY) || pickStr(process.env.JWT_SECRET);

const getEncryptionKey = () => {
  const secret = getEncryptionSecret();
  if (!secret) {
    throw createServiceError(
      "SETTINGS_ENCRYPTION_KEY or JWT_SECRET is required to store AI settings",
      503
    );
  }

  return crypto.createHash("sha256").update(secret).digest();
};

const encryptSecret = (value) => {
  const secret = pickStr(value);
  if (!secret) return "";

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, encrypted].map((part) => part.toString("base64")).join(".");
};

const decryptSecret = (value) => {
  const encryptedValue = pickStr(value);
  if (!encryptedValue) return "";

  const [ivEncoded, tagEncoded, payloadEncoded] = encryptedValue.split(".");
  if (!ivEncoded || !tagEncoded || !payloadEncoded) {
    throw createServiceError("Stored AI secret is invalid", 500);
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivEncoded, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payloadEncoded, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
};

const safeDecryptSecret = (value) => {
  try {
    return decryptSecret(value);
  } catch {
    return "";
  }
};

const buildEffectiveProvider = ({
  storedProvider,
  envProvider,
  geminiApiKey,
  openaiApiKey,
}) => {
  if (storedProvider) return storedProvider;
  if (envProvider) return envProvider;
  if (geminiApiKey) return "gemini";
  if (openaiApiKey) return "openai";
  return DEFAULT_AI_PROVIDER;
};

const buildProviderModel = (storedModel, envModel, fallback) =>
  pickStr(storedModel) || pickStr(envModel) || fallback;

const buildSource = (storedValue, envValue, fallback = "") => {
  if (pickStr(storedValue)) return "db";
  if (pickStr(envValue)) return "env";
  return fallback;
};

const ensureSettingsDoc = async () => {
  let doc = await Settings.findOne({ key: SETTINGS_KEY });
  if (doc) return doc;
  doc = await Settings.create({ key: SETTINGS_KEY });
  return doc;
};

const toPlainObject = (value) =>
  value?.toObject ? value.toObject() : value && typeof value === "object" ? { ...value } : {};

export const getEffectiveAiConfig = async () => {
  const settingsDoc = await Settings.findOne({ key: SETTINGS_KEY }).lean();
  const storedProvider = normalizeAiProvider(settingsDoc?.ai?.provider);
  const envProvider = normalizeAiProvider(process.env.AI_PROVIDER);

  const storedGeminiApiKey = safeDecryptSecret(settingsDoc?.ai?.gemini?.apiKeyEncrypted);
  const storedOpenAiApiKey = safeDecryptSecret(settingsDoc?.ai?.openai?.apiKeyEncrypted);
  const envGeminiApiKey = pickStr(process.env.GEMINI_API_KEY);
  const envOpenAiApiKey = pickStr(process.env.OPENAI_API_KEY);

  const geminiApiKey = storedGeminiApiKey || envGeminiApiKey;
  const openaiApiKey = storedOpenAiApiKey || envOpenAiApiKey;
  const provider = buildEffectiveProvider({
    storedProvider,
    envProvider,
    geminiApiKey,
    openaiApiKey,
  });

  const geminiModel = buildProviderModel(
    settingsDoc?.ai?.gemini?.model,
    process.env.GEMINI_MODEL,
    DEFAULT_GEMINI_MODEL
  );
  const openaiModel = buildProviderModel(
    settingsDoc?.ai?.openai?.model,
    process.env.OPENAI_MODEL,
    DEFAULT_OPENAI_MODEL
  );
  const activeModel = provider === "openai" ? openaiModel : geminiModel;
  const activeApiKey = provider === "openai" ? openaiApiKey : geminiApiKey;

  return {
    provider,
    activeModel,
    activeApiKey,
    geminiApiKey,
    openaiApiKey,
    geminiModel,
    openaiModel,
    hasGeminiApiKey: Boolean(geminiApiKey),
    hasOpenAiApiKey: Boolean(openaiApiKey),
    isEnabled: Boolean(activeApiKey),
    updatedAt: settingsDoc?.ai?.updatedAt || null,
    updatedBy: settingsDoc?.ai?.updatedBy ? String(settingsDoc.ai.updatedBy) : "",
    sources: {
      provider: buildSource(settingsDoc?.ai?.provider, process.env.AI_PROVIDER, "default"),
      geminiApiKey: buildSource(
        settingsDoc?.ai?.gemini?.apiKeyEncrypted,
        process.env.GEMINI_API_KEY
      ),
      openaiApiKey: buildSource(
        settingsDoc?.ai?.openai?.apiKeyEncrypted,
        process.env.OPENAI_API_KEY
      ),
      geminiModel: buildSource(settingsDoc?.ai?.gemini?.model, process.env.GEMINI_MODEL, "default"),
      openaiModel: buildSource(settingsDoc?.ai?.openai?.model, process.env.OPENAI_MODEL, "default"),
    },
    masked: {
      geminiApiKey: settingsDoc?.ai?.gemini?.apiKeyMask || maskSecret(envGeminiApiKey),
      openaiApiKey: settingsDoc?.ai?.openai?.apiKeyMask || maskSecret(envOpenAiApiKey),
    },
  };
};

export const getAdminAiSettingsView = async () => {
  const config = await getEffectiveAiConfig();

  return {
    provider: config.provider,
    enabled: config.isEnabled,
    activeModel: config.activeModel,
    features: {
      adminChatEnabled: config.isEnabled,
      i18nAutoTranslationEnabled: config.hasGeminiApiKey,
    },
    gemini: {
      hasApiKey: config.hasGeminiApiKey,
      apiKeyMasked: config.masked.geminiApiKey,
      model: config.geminiModel,
      source: config.sources.geminiApiKey || "none",
    },
    openai: {
      hasApiKey: config.hasOpenAiApiKey,
      apiKeyMasked: config.masked.openaiApiKey,
      model: config.openaiModel,
      source: config.sources.openaiApiKey || "none",
    },
    sources: config.sources,
    updatedAt: config.updatedAt,
    updatedBy: config.updatedBy,
  };
};

const upsertProviderSecret = (providerState, apiKey) => {
  const secret = pickStr(apiKey);
  if (!secret) {
    providerState.apiKeyEncrypted = "";
    providerState.apiKeyMask = "";
    return;
  }

  providerState.apiKeyEncrypted = encryptSecret(secret);
  providerState.apiKeyMask = maskSecret(secret);
};

export const updateStoredAiSettings = async (payload = {}, actor = null) => {
  const body = payload && typeof payload === "object" ? payload : {};
  const doc = await ensureSettingsDoc();
  const aiState = toPlainObject(doc.ai);
  const geminiState = toPlainObject(aiState.gemini);
  const openaiState = toPlainObject(aiState.openai);

  const requestedProvider = body.provider !== undefined ? normalizeAiProvider(body.provider) : "";
  if (body.provider !== undefined && !requestedProvider) {
    throw createServiceError("provider must be either gemini or openai", 400);
  }

  if (requestedProvider) {
    aiState.provider = requestedProvider;
  }

  if (body.geminiModel !== undefined) {
    geminiState.model = pickStr(body.geminiModel);
  }

  if (body.openaiModel !== undefined) {
    openaiState.model = pickStr(body.openaiModel);
  }

  const targetProvider =
    requestedProvider || normalizeAiProvider(body.targetProvider) || normalizeAiProvider(aiState.provider);
  const genericApiKey = body.apiKey !== undefined ? pickStr(body.apiKey) : undefined;
  const genericModel = body.model !== undefined ? pickStr(body.model) : undefined;

  if (genericModel !== undefined && targetProvider === "gemini") {
    geminiState.model = genericModel;
  }

  if (genericModel !== undefined && targetProvider === "openai") {
    openaiState.model = genericModel;
  }

  if (body.geminiApiKey !== undefined) {
    upsertProviderSecret(geminiState, body.geminiApiKey);
  }

  if (body.openaiApiKey !== undefined) {
    upsertProviderSecret(openaiState, body.openaiApiKey);
  }

  if (genericApiKey !== undefined && targetProvider === "gemini") {
    upsertProviderSecret(geminiState, genericApiKey);
  }

  if (genericApiKey !== undefined && targetProvider === "openai") {
    upsertProviderSecret(openaiState, genericApiKey);
  }

  if (toBool(body.clearGeminiApiKey) || (body.geminiApiKey !== undefined && !pickStr(body.geminiApiKey))) {
    upsertProviderSecret(geminiState, "");
  }

  if (toBool(body.clearOpenAiApiKey) || toBool(body.clearOpenaiApiKey) || (body.openaiApiKey !== undefined && !pickStr(body.openaiApiKey))) {
    upsertProviderSecret(openaiState, "");
  }

  if (toBool(body.clearApiKey) && targetProvider === "gemini") {
    upsertProviderSecret(geminiState, "");
  }

  if (toBool(body.clearApiKey) && targetProvider === "openai") {
    upsertProviderSecret(openaiState, "");
  }

  aiState.gemini = geminiState;
  aiState.openai = openaiState;
  aiState.updatedAt = new Date();
  aiState.updatedBy = actor?._id || actor?.id || null;

  doc.ai = aiState;
  await doc.save();

  return getAdminAiSettingsView();
};
