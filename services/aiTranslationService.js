import {
  DEFAULT_GEMINI_MODEL,
  getEffectiveAiConfig,
} from "./aiConfigService.js";

const pickStr = (value) => String(value ?? "").trim();

const normalizeLang = (value) => {
  const normalized = pickStr(value).toLowerCase();
  if (normalized === "en") return "en";
  if (normalized === "ua" || normalized === "uk") return "ua";
  return "";
};

const createServiceError = (message, statusCode = 500, raw = null) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (raw) error.raw = raw;
  return error;
};

const getGeminiApiKey = async () => {
  const aiConfig = await getEffectiveAiConfig();
  const apiKey = pickStr(aiConfig.geminiApiKey);
  if (!apiKey) {
    throw createServiceError("GEMINI_API_KEY is not configured", 503);
  }

  return apiKey;
};

export const getAiTranslationProvider = () => "gemini";

export const getAiTranslationModel = async () => {
  const aiConfig = await getEffectiveAiConfig();
  return pickStr(aiConfig.geminiModel) || DEFAULT_GEMINI_MODEL;
};

export const isAiTranslationEnabled = async () => {
  const aiConfig = await getEffectiveAiConfig();
  return Boolean(pickStr(aiConfig.geminiApiKey));
};

const getGeminiApiUrl = async (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(await getGeminiApiKey())}`;

const safeParseJson = (value, fallback = {}) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const humanizeKey = (key) =>
  pickStr(key)
    .split(".")
    .filter(Boolean)
    .slice(-2)
    .join(" ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildMetaSummary = (meta = {}) => {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};

  const summary = {};
  const allowedKeys = [
    "defaultValue",
    "fallback",
    "label",
    "text",
    "title",
    "description",
    "hint",
    "context",
    "namespace",
    "component",
  ];

  allowedKeys.forEach((key) => {
    const value = pickStr(meta[key]);
    if (value) summary[key] = value;
  });

  return summary;
};

const buildSourceText = ({ sourceText = "", meta = {}, key = "" }) => {
  const direct = pickStr(sourceText);
  if (direct) return direct;

  const metaSummary = buildMetaSummary(meta);
  const candidates = [
    metaSummary.defaultValue,
    metaSummary.fallback,
    metaSummary.label,
    metaSummary.text,
    metaSummary.title,
    metaSummary.description,
    metaSummary.hint,
  ];

  const firstCandidate = candidates.find((item) => pickStr(item));
  if (firstCandidate) return pickStr(firstCandidate);

  return humanizeKey(key);
};

const buildPrompt = ({ key, sourceLang, sourceText, page, meta, existingTranslations }) => {
  const metaSummary = buildMetaSummary(meta);

  return [
    "You translate i18n keys for a furniture ecommerce app.",
    'Return JSON only in this exact shape: {"ua":"...","en":"..."}',
    "Rules:",
    "- Keep translations concise and natural for UI copy.",
    "- Preserve placeholders, variables, braces, punctuation, and numbers from the source text.",
    "- If the text is a label, keep it short. If it is a sentence, translate as a sentence.",
    "- Use fluent Ukrainian for ua and fluent English for en.",
    "- Do not add explanations or extra keys.",
    "",
    `Key: ${pickStr(key)}`,
    `Page: ${pickStr(page) || "unknown"}`,
    `Source language: ${pickStr(sourceLang) || "unknown"}`,
    `Source text: ${pickStr(sourceText) || "none"}`,
    `Existing ua: ${pickStr(existingTranslations?.ua) || "none"}`,
    `Existing en: ${pickStr(existingTranslations?.en) || "none"}`,
    `Meta: ${JSON.stringify(metaSummary)}`,
  ].join("\n");
};

const extractResponseText = (responseJson = {}) => {
  const parts = responseJson?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";

  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
};

const normalizeTranslationResult = (result, sourceLang, sourceText, existingTranslations) => {
  const ua =
    pickStr(result?.ua) ||
    (sourceLang === "ua" ? pickStr(sourceText) : "") ||
    pickStr(existingTranslations?.ua);
  const en =
    pickStr(result?.en) ||
    (sourceLang === "en" ? pickStr(sourceText) : "") ||
    pickStr(existingTranslations?.en);

  if (!ua || !en) {
    throw createServiceError("AI translation response is incomplete", 502, result);
  }

  return {
    ua: sourceLang === "ua" && pickStr(sourceText) ? pickStr(sourceText) : ua,
    en: sourceLang === "en" && pickStr(sourceText) ? pickStr(sourceText) : en,
  };
};

export const translateKeyWithGemini = async ({
  key,
  sourceLang = "",
  sourceText = "",
  page = "",
  meta = {},
  existingTranslations = {},
}) => {
  const normalizedSourceLang = normalizeLang(sourceLang);
  const resolvedSourceText = buildSourceText({ sourceText, meta, key });
  const model = await getAiTranslationModel();

  const response = await fetch(await getGeminiApiUrl(model), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: buildPrompt({
                key,
                sourceLang: normalizedSourceLang,
                sourceText: resolvedSourceText,
                page,
                meta,
                existingTranslations,
              }),
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 200,
        responseMimeType: "application/json",
      },
    }),
  });

  const responseJson = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw createServiceError(
      responseJson?.error?.message || response.statusText || "Gemini translation request failed",
      response.status || 502,
      responseJson
    );
  }

  const rawText = extractResponseText(responseJson);
  const parsed = safeParseJson(rawText, null);
  if (!parsed || typeof parsed !== "object") {
    throw createServiceError("Gemini translation returned invalid JSON", 502, {
      rawText,
      responseJson,
    });
  }

  return {
    provider: getAiTranslationProvider(),
    model,
    translations: normalizeTranslationResult(
      parsed,
      normalizedSourceLang,
      resolvedSourceText,
      existingTranslations
    ),
    sourceText: resolvedSourceText,
  };
};

export { normalizeLang };
