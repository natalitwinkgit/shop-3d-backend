import Translation from "../models/Translation.js";

const pickStr = (value) => String(value || "").trim();

const normalizeKey = (value) =>
  pickStr(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export const resolveLocationLang = (req) => {
  const explicitLang = pickStr(req?.query?.lang || req?.headers?.["x-lang"]).toLowerCase();
  if (explicitLang === "ua" || explicitLang === "en") return explicitLang;

  const acceptLanguage = pickStr(req?.headers?.["accept-language"]).toLowerCase();
  if (acceptLanguage.startsWith("en")) return "en";
  return "ua";
};

export const loadLocationTranslations = async (lang = "ua") => {
  const normalizedLang = lang === "en" ? "en" : "ua";
  const translation = await Translation.findOne({ lang: normalizedLang })
    .select("locations")
    .lean();

  return translation?.locations || {};
};

const resolveTranslatedValue = (dictionary, rawKey, fallback = "") => {
  const key = pickStr(rawKey);
  if (!key) return fallback;
  return pickStr(dictionary?.[key]) || fallback;
};

export const buildLocationPresentation = (locationDoc = {}, translations = {}) => {
  const city = pickStr(locationDoc.city);
  const cityKey = pickStr(locationDoc.cityKey) || normalizeKey(city);
  const type = pickStr(locationDoc.type);
  const nameKey = pickStr(locationDoc.nameKey);
  const addressKey = pickStr(locationDoc.addressKey);

  const translatedCity =
    resolveTranslatedValue(translations?.cities, city, "") ||
    resolveTranslatedValue(translations?.cities, cityKey, "") ||
    city;
  const translatedName =
    resolveTranslatedValue(translations?.names, nameKey, "") ||
    pickStr(locationDoc.name) ||
    nameKey;
  const translatedAddress =
    resolveTranslatedValue(translations?.addresses, addressKey, "") ||
    pickStr(locationDoc.address) ||
    addressKey;
  const translatedType =
    resolveTranslatedValue(translations?.types, type, "") ||
    type;

  return {
    _id: String(locationDoc._id || locationDoc.id || ""),
    id: String(locationDoc._id || locationDoc.id || ""),
    type,
    typeLabel: translatedType,
    city,
    cityKey,
    cityLabel: translatedCity,
    name: translatedName,
    nameKey,
    address: translatedAddress,
    addressKey,
    phone: pickStr(locationDoc.phone),
    isActive: locationDoc.isActive ?? true,
    coordinates: {
      lat: Number(locationDoc.coordinates?.lat || 0),
      lng: Number(locationDoc.coordinates?.lng || 0),
    },
    workingHours: {
      ua: pickStr(locationDoc.workingHours?.ua),
      en: pickStr(locationDoc.workingHours?.en),
    },
    createdAt: locationDoc.createdAt || null,
    updatedAt: locationDoc.updatedAt || null,
  };
};
