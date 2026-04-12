import fs from "fs";
import { fileURLToPath } from "url";

const htmlColorsPath = fileURLToPath(new URL("../../data/html-colors.json", import.meta.url));
const productColorOverridesPath = fileURLToPath(
  new URL("../../data/product-color-overrides.json", import.meta.url)
);

const readPaletteFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return Array.isArray(parsed) ? parsed : [];
};

const normalizeKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeRgb = (value) => {
  if (!Array.isArray(value) || value.length !== 3) return null;

  const normalized = value.map((component) => Number(component));
  if (
    normalized.some(
      (component) =>
        !Number.isInteger(component) || component < 0 || component > 255
    )
  ) {
    return null;
  }

  return normalized;
};

const normalizeHex = (value) => {
  const raw = String(value || "").trim().replace(/^#/, "").toUpperCase();
  if (/^[0-9A-F]{6}$/.test(raw)) return `#${raw}`;
  return "";
};

const normalizeColorDoc = (color = {}) => {
  const key = normalizeKey(color.key);
  const rgb = normalizeRgb(color.rgb);
  const hex = normalizeHex(color.hex);

  if (!key || !rgb || !hex) {
    return null;
  }

  return {
    key,
    name: {
      ua: String(color?.name?.ua || color?.name?.uk || color?.name?.en || key).trim(),
      en: String(color?.name?.en || color?.name?.ua || color?.name?.uk || key).trim(),
    },
    hex,
    rgb,
    slug: String(color.slug || key).trim() || key,
    group: String(color.group || "").trim() || null,
    isActive: color.isActive !== false,
  };
};

const hashString = (value) =>
  Array.from(String(value || "")).reduce(
    (hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0,
    0
  );

export const loadMergedProductColors = () => {
  const merged = new Map();

  [...readPaletteFile(htmlColorsPath), ...readPaletteFile(productColorOverridesPath)].forEach(
    (color) => {
      const normalized = normalizeColorDoc(color);
      if (!normalized) return;
      merged.set(normalized.key, normalized);
    }
  );

  return Array.from(merged.values()).sort((left, right) =>
    left.key.localeCompare(right.key)
  );
};

export const buildColorLookup = (colors = []) =>
  new Map(
    colors
      .map((color) => normalizeColorDoc(color))
      .filter(Boolean)
      .map((color) => [color.key, color])
  );

export const pickProductColor = ({
  product = {},
  palette = [],
  colorLookup = new Map(),
}) => {
  const sourceKeys = Array.isArray(product?.colorKeys) ? product.colorKeys : [];
  const validColorKeys = Array.from(
    new Set(
      sourceKeys
        .map((key) => normalizeKey(key))
        .filter((key) => key && colorLookup.has(key))
    )
  );

  let primaryColor = validColorKeys.length
    ? colorLookup.get(validColorKeys[0])
    : null;

  if (!primaryColor && palette.length) {
    primaryColor = palette[hashString(product?.slug || product?.name?.en || product?.name?.ua) % palette.length];
  }

  if (!primaryColor) {
    return { primaryColor: null, colorKeys: [] };
  }

  const normalizedColorKeys = validColorKeys.length
    ? validColorKeys
    : [primaryColor.key];

  return {
    primaryColor,
    colorKeys: normalizedColorKeys,
  };
};

export const productColorPaletteSources = {
  htmlColorsPath,
  productColorOverridesPath,
};
