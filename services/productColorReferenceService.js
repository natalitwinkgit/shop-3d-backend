import Color from "../models/Color.js";

const COLOR_PROJECTION = "key name hex rgb slug group isActive";

const normalizeKey = (value) => String(value || "").trim();

const getColorKeyValue = (value) => {
  if (!value) return "";
  if (typeof value === "object") {
    return String(value.key || value.slug || value.id || "").trim();
  }
  return String(value).trim();
};

const getProductColorKeys = (product = {}) =>
  Array.from(
    new Set(
      [
        ...(Array.isArray(product?.colorKeys) ? product.colorKeys : []),
        product?.colorKey,
        product?.color,
        product?.primaryColorKey,
        product?.primaryColor?.key,
        ...(Array.isArray(product?.colors) ? product.colors.map((color) => color?.key) : []),
      ]
        .map((key) => normalizeKey(getColorKeyValue(key)))
        .filter(Boolean)
    )
  );

const normalizeColorPayload = (color = {}) => ({
  key: normalizeKey(color.key),
  name: {
    ua: String(color?.name?.ua || color?.name?.uk || color?.name?.en || "").trim(),
    en: String(color?.name?.en || color?.name?.ua || color?.name?.uk || "").trim(),
  },
  hex: String(color.hex || "").trim(),
  rgb: Array.isArray(color.rgb) ? color.rgb.map((component) => Number(component)) : [],
  slug: color.slug || null,
  group: color.group || null,
  isActive: color.isActive !== false,
});

export const attachColorReferencesToProducts = async (products = []) => {
  const source = Array.isArray(products) ? products.filter(Boolean) : [products].filter(Boolean);
  if (!source.length) {
    return Array.isArray(products) ? [] : null;
  }

  const colorKeys = Array.from(new Set(source.flatMap((product) => getProductColorKeys(product))));
  const colorDocs = colorKeys.length
    ? await Color.find({ key: { $in: colorKeys } }).select(COLOR_PROJECTION).lean()
    : [];
  const colorMap = new Map(
    colorDocs
      .map((color) => normalizeColorPayload(color))
      .filter((color) => color.key)
      .map((color) => [color.key, color])
  );

  const hydrated = source.map((product) => {
    const productColorKeys = getProductColorKeys(product);
    const primaryColor = productColorKeys.length ? colorMap.get(productColorKeys[0]) : null;
    const colors = productColorKeys.map((key) => colorMap.get(key)).filter(Boolean);
    return {
      ...product,
      colorKeys: productColorKeys,
      colors,
      primaryColor: primaryColor || colors[0] || null,
      color: primaryColor || colors[0] || null,
    };
  });

  return Array.isArray(products) ? hydrated : hydrated[0] || null;
};
