import Translation from "../models/Translation.js";

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeLang = (value) => {
  const lang = String(value || "").trim().toLowerCase();
  if (!lang || lang === "uk") return "ua";
  return lang === "en" ? "en" : "ua";
};

const stripMeta = (doc = {}) => {
  const {
    _id,
    __v,
    createdAt,
    updatedAt,
    lang,
    ...payload
  } = doc || {};

  return payload;
};

const deepMerge = (base, override) => {
  if (!isPlainObject(base) && !isPlainObject(override)) {
    return override ?? base;
  }

  const result = { ...(base || {}) };

  Object.entries(override || {}).forEach(([key, value]) => {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key], value);
      return;
    }

    result[key] = value;
  });

  return result;
};

export const getTranslationsByLang = async (req, res) => {
  try {
    const lang = normalizeLang(req.params?.lang);

    if (!lang) {
      return res.status(400).json({ message: "Language is required" });
    }

    const [requestedDoc, uaDoc, enDoc] = await Promise.all([
      Translation.findOne({ lang }).lean(),
      Translation.findOne({ lang: "ua" }).lean(),
      Translation.findOne({ lang: "en" }).lean(),
    ]);

    if (!requestedDoc && !uaDoc && !enDoc) {
      return res.status(404).json({
        message: `Translations for '${lang}' not found`,
      });
    }

    const fallbackDocs =
      lang === "en"
        ? [stripMeta(uaDoc), stripMeta(enDoc || requestedDoc)]
        : [stripMeta(enDoc), stripMeta(uaDoc || requestedDoc)];

    const payload = fallbackDocs.reduce((acc, doc) => deepMerge(acc, doc || {}), {});

    return res.json({
      lang,
      ...payload,
    });
  } catch (error) {
    console.error("Translation controller error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};
