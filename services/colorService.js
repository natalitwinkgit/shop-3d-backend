import Color from "../models/Color.js";

const normalizeHex = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  const cleaned = trimmed.replace(/^#/, "");
  if (/^[0-9A-F]{3}$/.test(cleaned)) {
    return `#${cleaned[0]}${cleaned[0]}${cleaned[1]}${cleaned[1]}${cleaned[2]}${cleaned[2]}`;
  }
  if (/^[0-9A-F]{6}$/.test(cleaned)) {
    return `#${cleaned}`;
  }
  return null;
};

const parseRgb = (value) => {
  if (Array.isArray(value) && value.length === 3) {
    return value.map((v) => Number(v));
  }
  if (typeof value !== "string") return null;

  const raw = value.trim();
  const rgbMatch = raw.match(/rgb\s*\(\s*(\d{1,3})\s*[ ,]+(\d{1,3})\s*[ ,]+(\d{1,3})\s*\)/i);
  if (rgbMatch) {
    return rgbMatch.slice(1, 4).map((n) => Number(n));
  }

  const parts = raw.split(/[,;\s]+/).filter(Boolean);
  if (parts.length === 3 && parts.every((p) => /^\d{1,3}$/.test(p))) {
    return parts.map((n) => Number(n));
  }

  return null;
};

const normalizeRgb = (value) => {
  const rgb = parseRgb(value);
  if (!rgb) return null;
  if (rgb.some((component) => component < 0 || component > 255 || Number.isNaN(component))) {
    return null;
  }
  return rgb;
};

const hexToRgb = (hex) => {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;

  const clean = normalized.substring(1);
  return [
    parseInt(clean.substring(0, 2), 16),
    parseInt(clean.substring(2, 4), 16),
    parseInt(clean.substring(4, 6), 16),
  ];
};

const getDistance = (rgbA, rgbB) =>
  rgbA.reduce((sum, component, index) => {
    const diff = component - rgbB[index];
    return sum + diff * diff;
  }, 0);

const escapeRegExp = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildColorProjection = "key name hex rgb slug group isActive";

const findExactColorByHex = async (hex) => {
  const normalizedHex = normalizeHex(hex);
  if (!normalizedHex) return null;
  return Color.findOne({ hex: normalizedHex }).select(buildColorProjection).lean();
};

const findExactColorByRgb = async (rgb) => {
  const normalized = normalizeRgb(rgb);
  if (!normalized) return null;
  return Color.findOne({ "rgb.0": normalized[0], "rgb.1": normalized[1], "rgb.2": normalized[2] })
    .select(buildColorProjection)
    .lean();
};

const findNearestColor = async (rgb) => {
  const normalized = normalizeRgb(rgb);
  if (!normalized) return null;

  const colors = await Color.find().select(buildColorProjection).lean();
  if (!colors.length) return null;

  let best = null;
  let bestDistance = Infinity;

  for (const item of colors) {
    const distance = getDistance(normalized, item.rgb);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = item;
    }
  }

  if (!best) return null;
  return { color: best, distance: bestDistance };
};

const searchColorsByName = async (query) => {
  if (!query || typeof query !== "string") return [];
  const normalized = query.trim();
  if (!normalized) return [];

  const normalizedRegex = new RegExp(escapeRegExp(normalized), "i");
  return Color.find({
    $or: [
      { key: normalizedRegex },
      { "name.ua": normalizedRegex },
      { "name.en": normalizedRegex },
    ],
  })
    .select(buildColorProjection)
    .lean();
};

export const getAllColors = async ({ onlyActive = false } = {}) => {
  const filter = {};
  if (onlyActive) filter.isActive = true;
  return Color.find(filter).select(buildColorProjection).sort({ key: 1 }).lean();
};

export const lookupColor = async ({ hex, rgb }) => {
  if (hex) {
    const exact = await findExactColorByHex(hex);
    if (exact) {
      return { exact: true, color: exact, query: { hex: normalizeHex(hex), rgb: hexToRgb(hex) }, distance: 0 };
    }

    const parsedRgb = hexToRgb(hex);
    if (parsedRgb) {
      const nearest = await findNearestColor(parsedRgb);
      if (!nearest) return null;
      return {
        exact: false,
        color: nearest.color,
        query: { hex: normalizeHex(hex), rgb: parsedRgb },
        distance: nearest.distance,
      };
    }
  }

  if (rgb) {
    const exact = await findExactColorByRgb(rgb);
    if (exact) {
      return { exact: true, color: exact, query: { rgb: normalizeRgb(rgb), hex: exact.hex }, distance: 0 };
    }

    const normalizedRgb = normalizeRgb(rgb);
    if (normalizedRgb) {
      const nearest = await findNearestColor(normalizedRgb);
      if (!nearest) return null;
      return {
        exact: false,
        color: nearest.color,
        query: { rgb: normalizedRgb, hex: nearest.color.hex },
        distance: nearest.distance,
      };
    }
  }

  return null;
};

export const findColors = async (query) => searchColorsByName(query);
