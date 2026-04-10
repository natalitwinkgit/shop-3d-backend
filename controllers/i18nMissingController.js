import MissingTranslation from "../models/MissingTranslation.js";
import Translation from "../models/Translation.js";
import {
  getAiTranslationModel,
  getAiTranslationProvider,
  isAiTranslationEnabled,
  normalizeLang,
  translateKeyWithGemini,
} from "../services/aiTranslationService.js";

const pickStr = (value) => String(value ?? "").trim();

const createHttpError = (message, statusCode = 400, raw = null) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (raw) error.raw = raw;
  return error;
};

const normalizeKeyPath = (value) => {
  const segments = pickStr(value)
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (!segments.length) return "";
  if (segments.some((segment) => segment.startsWith("$"))) return "";

  return segments.join(".");
};

const safeParseJson = (value, fallback = {}) => {
  if (typeof value !== "string") return value && typeof value === "object" ? value : fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const getByPath = (obj, path) =>
  normalizeKeyPath(path)
    .split(".")
    .reduce((acc, segment) => (acc && typeof acc === "object" ? acc[segment] : undefined), obj);

const extractMeta = (body = {}) => {
  if (body.meta === undefined) return {};
  const parsed = safeParseJson(body.meta, {});
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
};

const extractSourceText = (body = {}, meta = {}) =>
  [
    body.defaultValue,
    body.value,
    body.text,
    body.fallback,
    meta.defaultValue,
    meta.fallback,
    meta.label,
    meta.text,
    meta.title,
    meta.description,
    meta.hint,
  ]
    .map((item) => pickStr(item))
    .find(Boolean) || "";

const saveTranslationValue = async (lang, keyPath, value) => {
  await Translation.updateOne(
    { lang },
    {
      $set: {
        [keyPath]: value,
      },
      $setOnInsert: { lang },
    },
    { upsert: true }
  );
};

const upsertMissingTranslationReport = async ({
  key,
  page,
  sourceLang,
  sourceText,
  meta,
  status = "pending",
  translations = {},
  provider = "",
  model = "",
  lastError = null,
  resolvedAt = null,
}) => {
  const setPayload = {
    page,
    sourceLang,
    sourceText,
    meta,
    status,
    translations: {
      ua: pickStr(translations?.ua),
      en: pickStr(translations?.en),
    },
    provider: pickStr(provider),
    model: pickStr(model),
    lastRequestedAt: new Date(),
    resolvedAt,
  };

  if (lastError) {
    setPayload.lastError = {
      message: pickStr(lastError.message),
      statusCode: Number(lastError.statusCode || 0),
      at: new Date(),
    };
  } else {
    setPayload.lastError = {
      message: "",
      statusCode: 0,
      at: null,
    };
  }

  return MissingTranslation.findOneAndUpdate(
    { key },
    {
      $set: setPayload,
      $inc: { occurrences: 1 },
      $setOnInsert: { key },
    },
    { new: true, upsert: true }
  ).lean();
};

export const getI18nMissingStatus = async (_req, res, next) => {
  try {
    const [aiEnabled, aiModel] = await Promise.all([
      isAiTranslationEnabled(),
      getAiTranslationModel(),
    ]);
    const [docsCount, pending, resolved, failed] = await Promise.all([
      Translation.countDocuments(),
      MissingTranslation.countDocuments({ status: "pending" }),
      MissingTranslation.countDocuments({ status: "resolved" }),
      MissingTranslation.countDocuments({ status: "failed" }),
    ]);

    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      aiEnabled,
      provider: getAiTranslationProvider(),
      model: aiModel,
      supportedLangs: ["ua", "en"],
      translationsDocs: docsCount,
      missingReports: {
        pending,
        resolved,
        failed,
      },
    });
  } catch (error) {
    next(createHttpError(error?.message || "Server error", error?.statusCode || 500, error));
  }
};

export const createMissingTranslation = async (req, res, next) => {
  try {
    const key = normalizeKeyPath(req.body?.key);
    if (!key) {
      throw createHttpError("key is required");
    }

    const [aiEnabled, aiModel] = await Promise.all([
      isAiTranslationEnabled(),
      getAiTranslationModel(),
    ]);

    if (!aiEnabled) {
      throw createHttpError("AI translation is not configured", 503);
    }

    const meta = extractMeta(req.body);
    const requestedLang = normalizeLang(req.body?.lang) || "ua";
    const sourceText = extractSourceText(req.body, meta);
    const page = pickStr(req.body?.page);
    const shouldForce = ["1", "true", "yes"].includes(
      pickStr(req.body?.force).toLowerCase()
    );

    const [uaDoc, enDoc] = await Promise.all([
      Translation.findOne({ lang: "ua" }).lean(),
      Translation.findOne({ lang: "en" }).lean(),
    ]);

    const existingTranslations = {
      ua: pickStr(getByPath(uaDoc, key)),
      en: pickStr(getByPath(enDoc, key)),
    };

    if (sourceText && !existingTranslations[requestedLang]) {
      await saveTranslationValue(requestedLang, key, sourceText);
      existingTranslations[requestedLang] = sourceText;
    }

    if (!shouldForce && existingTranslations.ua && existingTranslations.en) {
      await upsertMissingTranslationReport({
        key,
        page,
        sourceLang: requestedLang,
        sourceText,
        meta,
        status: "resolved",
        translations: existingTranslations,
        provider: getAiTranslationProvider(),
        model: aiModel,
        resolvedAt: new Date(),
      });

      return res.status(200).json({
        ok: true,
        key,
        page,
        translated: false,
        source: "existing",
        provider: getAiTranslationProvider(),
        model: aiModel,
        translations: existingTranslations,
      });
    }

    try {
      const aiResult = await translateKeyWithGemini({
        key,
        sourceLang: requestedLang,
        sourceText,
        page,
        meta,
        existingTranslations,
      });

      const finalTranslations = {
        ua:
          existingTranslations.ua && !shouldForce
            ? existingTranslations.ua
            : aiResult.translations.ua,
        en:
          existingTranslations.en && !shouldForce
            ? existingTranslations.en
            : aiResult.translations.en,
      };

      await Promise.all([
        saveTranslationValue("ua", key, finalTranslations.ua),
        saveTranslationValue("en", key, finalTranslations.en),
      ]);

      await upsertMissingTranslationReport({
        key,
        page,
        sourceLang: requestedLang,
        sourceText: aiResult.sourceText,
        meta,
        status: "resolved",
        translations: finalTranslations,
        provider: aiResult.provider,
        model: aiResult.model,
        resolvedAt: new Date(),
      });

      return res.status(201).json({
        ok: true,
        key,
        page,
        translated: true,
        provider: aiResult.provider,
        model: aiResult.model,
        sourceText: aiResult.sourceText,
        translations: finalTranslations,
        saved: {
          ua: true,
          en: true,
        },
      });
    } catch (aiError) {
      const fallbackTranslations = {
        ua: existingTranslations.ua,
        en: existingTranslations.en,
      };

      const report = await upsertMissingTranslationReport({
        key,
        page,
        sourceLang: requestedLang,
        sourceText,
        meta,
        status: "failed",
        translations: fallbackTranslations,
        provider: getAiTranslationProvider(),
        model: aiModel,
        lastError: {
          message: aiError?.message || "AI translation failed",
          statusCode: aiError?.statusCode || aiError?.status || 500,
        },
      });

      return res.status(202).json({
        ok: true,
        key,
        page,
        translated: false,
        source: "fallback",
        provider: getAiTranslationProvider(),
        model: aiModel,
        sourceText,
        translations: fallbackTranslations,
        report: {
          id: String(report?._id || ""),
          status: report?.status || "failed",
          occurrences: Number(report?.occurrences || 1),
        },
        error: {
          message: aiError?.message || "AI translation failed",
          statusCode: aiError?.statusCode || aiError?.status || 500,
        },
      });
    }
  } catch (error) {
    return next(error?.statusCode ? error : createHttpError(error?.message || "Server error", error?.statusCode || 500, error));
  }
};
