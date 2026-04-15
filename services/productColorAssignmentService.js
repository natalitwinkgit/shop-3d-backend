import Color from "../models/Color.js";

const pickStr = (value) => String(value ?? "").trim();

const hashString = (value) =>
  Array.from(String(value || "")).reduce(
    (hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0,
    0
  );

export const pickFallbackColorKeys = ({
  slug = "",
  name = {},
  availableColorKeys = [],
} = {}) => {
  const colorKeys = Array.from(
    new Set(
      (Array.isArray(availableColorKeys) ? availableColorKeys : [])
        .map((key) => pickStr(key).toLowerCase())
        .filter(Boolean)
    )
  );

  if (!colorKeys.length) return [];

  const seed = pickStr(slug) || pickStr(name?.en) || pickStr(name?.ua);
  const index = seed ? hashString(seed) % colorKeys.length : 0;
  return [colorKeys[index]];
};

export const ensureProductColorKeys = async (productPayload = {}) => {
  if (!productPayload || typeof productPayload !== "object") return productPayload;

  const existingColorKeys = Array.isArray(productPayload.colorKeys)
    ? productPayload.colorKeys.map((key) => pickStr(key).toLowerCase()).filter(Boolean)
    : [];

  if (existingColorKeys.length) {
    return {
      ...productPayload,
      colorKeys: Array.from(new Set(existingColorKeys)),
    };
  }

  const activeColors = await Color.find({ isActive: { $ne: false } })
    .select("key")
    .sort({ key: 1 })
    .lean();

  const fallbackColorKeys = pickFallbackColorKeys({
    slug: productPayload.slug,
    name: productPayload.name,
    availableColorKeys: activeColors.map((color) => color.key),
  });

  if (!fallbackColorKeys.length) {
    return {
      ...productPayload,
      colorKeys: existingColorKeys,
    };
  }

  return {
    ...productPayload,
    colorKeys: fallbackColorKeys,
  };
};
