import mongoose from "mongoose";

import Color from "../models/Color.js";
import Manufacturer from "../models/Manufacturer.js";
import Material from "../models/Material.js";
import ProductCollection from "../models/ProductCollection.js";
import ProductRoom from "../models/ProductRoom.js";
import ProductStyle from "../models/ProductStyle.js";
import { createHttpError } from "../services/productPayloadService.js";

function serializeColorAttribute(color = {}) {
  return {
    _id: String(color._id || ""),
    id: String(color._id || ""),
    kind: "color",
    key: String(color.key || ""),
    name: {
      ua: String(color.name?.ua || color.name?.en || "").trim(),
      en: String(color.name?.en || color.name?.ua || "").trim(),
    },
    hex: String(color.hex || "").trim(),
    rgb: Array.isArray(color.rgb) ? color.rgb.map((component) => Number(component)) : [],
    slug: String(color.slug || "").trim() || null,
    group: String(color.group || "").trim() || null,
    isActive: color.isActive !== false,
    createdAt: color.createdAt || null,
    updatedAt: color.updatedAt || null,
  };
}

const PRODUCT_ATTRIBUTE_DICTIONARIES = [
  { kind: "room", responseField: "rooms", model: ProductRoom },
  { kind: "style", responseField: "styles", model: ProductStyle },
  { kind: "collection", responseField: "collections", model: ProductCollection },
  { kind: "color", responseField: "colors", model: Color, serialize: serializeColorAttribute },
];

const getProductAttributeConfig = (kind) =>
  PRODUCT_ATTRIBUTE_DICTIONARIES.find((item) => item.kind === kind);

const normalizeKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const parseLocalizedName = (value, fieldName = "name") => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createHttpError(400, `${fieldName} must be a localized object`);
  }

  const ua = String(value.ua || value.uk || value.en || "").trim();
  const en = String(value.en || value.ua || value.uk || "").trim();
  if (!ua || !en) {
    throw createHttpError(400, `${fieldName}.ua and ${fieldName}.en are required`);
  }

  return { ua, en };
};

const keyToLabel = (key = "") =>
  String(key || "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");

const parseAttributeLocalizedName = (value, fallbackKey = "", fieldName = "name") => {
  const fallbackLabel = keyToLabel(fallbackKey);

  if (typeof value === "string") {
    const label = String(value || "").trim();
    if (!label) throw createHttpError(400, `${fieldName} is required`);
    return { ua: label, en: label };
  }

  if (value === undefined || value === null) {
    if (!fallbackLabel) throw createHttpError(400, `${fieldName} is required`);
    return { ua: fallbackLabel, en: fallbackLabel };
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw createHttpError(400, `${fieldName} must be a string or localized object`);
  }

  const ua = String(value.ua || value.uk || value.en || fallbackLabel).trim();
  const en = String(value.en || value.ua || value.uk || fallbackLabel).trim();
  if (!ua || !en) {
    throw createHttpError(400, `${fieldName}.ua and ${fieldName}.en are required`);
  }

  return { ua, en };
};

const parseLocalizedDescription = (value) => {
  if (value === undefined || value === null) return { ua: "", en: "" };
  if (typeof value !== "object" || Array.isArray(value)) {
    throw createHttpError(400, "description must be a localized object");
  }

  return {
    ua: String(value.ua || value.uk || "").trim(),
    en: String(value.en || "").trim(),
  };
};

const normalizeColorKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeColorHex = (value) => {
  if (typeof value !== "string") return "";
  const cleaned = value.trim().replace(/^#/, "").toUpperCase();
  if (/^[0-9A-F]{3}$/.test(cleaned)) {
    return `#${cleaned[0]}${cleaned[0]}${cleaned[1]}${cleaned[1]}${cleaned[2]}${cleaned[2]}`;
  }
  if (/^[0-9A-F]{6}$/.test(cleaned)) {
    return `#${cleaned}`;
  }
  return "";
};

const parseColorRgb = (value) => {
  if (Array.isArray(value) && value.length === 3) {
    const rgb = value.map((component) => Number(component));
    if (rgb.every((component) => Number.isInteger(component) && component >= 0 && component <= 255)) {
      return rgb;
    }
    return null;
  }

  if (typeof value !== "string") return null;

  const normalized = value.trim();
  const rgbMatch = normalized.match(
    /rgb\s*\(\s*(\d{1,3})\s*[ ,]+(\d{1,3})\s*[ ,]+(\d{1,3})\s*\)/i
  );
  if (rgbMatch) {
    const rgb = rgbMatch.slice(1, 4).map((component) => Number(component));
    if (rgb.every((component) => Number.isInteger(component) && component >= 0 && component <= 255)) {
      return rgb;
    }
    return null;
  }

  const parts = normalized.split(/[,;\s]+/).filter(Boolean);
  if (parts.length === 3 && parts.every((part) => /^\d{1,3}$/.test(part))) {
    const rgb = parts.map((component) => Number(component));
    if (rgb.every((component) => Number.isInteger(component) && component >= 0 && component <= 255)) {
      return rgb;
    }
  }

  return null;
};

const parseOptionalString = (value) => {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
};

const serializeColorDocument = (color = {}) => serializeColorAttribute(color);

const buildColorMutationPayload = (body = {}, existingColor = null) => {
  const payload = {};
  const nameSource =
    typeof body.name === "string"
      ? body.name
      : body.name?.en || body.name?.ua || body.slug || "";

  if (body.key !== undefined || !existingColor) {
    const key = normalizeColorKey(body.key || nameSource);
    if (!key) throw createHttpError(400, "key is required");
    payload.key = key;
    if (body.slug === undefined && !existingColor) {
      payload.slug = key;
    }
  } else if (body.slug === undefined && existingColor?.slug) {
    payload.slug = existingColor.slug;
  }

  if (body.name !== undefined || !existingColor) {
    payload.name = parseAttributeLocalizedName(body.name, payload.key || existingColor?.key || "", "name");
  }

  if (body.hex !== undefined || !existingColor) {
    const hex = normalizeColorHex(body.hex || existingColor?.hex);
    if (!hex) throw createHttpError(400, "hex is required and must be a valid HEX color");
    payload.hex = hex;
  }

  if (body.rgb !== undefined || !existingColor) {
    const rgb = parseColorRgb(body.rgb || existingColor?.rgb);
    if (!rgb) throw createHttpError(400, "rgb is required and must be an array of three integers");
    payload.rgb = rgb;
  }

  if (body.slug !== undefined) {
    payload.slug = parseOptionalString(body.slug);
  } else if (existingColor?.slug && !payload.slug) {
    payload.slug = existingColor.slug;
  }

  if (body.group !== undefined) {
    payload.group = parseOptionalString(body.group);
  } else if (existingColor?.group && !payload.group) {
    payload.group = existingColor.group;
  }

  if (body.isActive !== undefined) {
    payload.isActive = parseBoolean(body.isActive, true);
  }

  if (body.key !== undefined && body.slug === undefined && !existingColor) {
    payload.slug = payload.slug || payload.key;
  }

  if (body.key !== undefined && existingColor && body.slug === undefined) {
    payload.slug = payload.slug || payload.key;
  }

  return payload;
};

const handleDuplicateKey = (error, next, entityName) => {
  if (error?.code === 11000) {
    return next(createHttpError(409, `${entityName} key must be unique`));
  }

  if (error?.name === "ValidationError") {
    return next(createHttpError(400, error.message));
  }

  return next(error);
};

const parseStringArray = (value) => {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "")
    .split(/[\r\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const parseAliasKeys = (value) =>
  Array.from(new Set(parseStringArray(value).map(normalizeKey).filter(Boolean)));

const parseBoolean = (value, fallback = true) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
};

const parseSortOrder = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw createHttpError(400, "sortOrder must be a number");
  return parsed;
};

const serializeProductAttribute = (attribute = {}, kind = "") => ({
  _id: String(attribute._id || ""),
  id: String(attribute._id || ""),
  kind,
  key: String(attribute.key || ""),
  name: {
    ua: String(attribute.name?.ua || attribute.name?.en || "").trim(),
    en: String(attribute.name?.en || attribute.name?.ua || "").trim(),
  },
  description: {
    ua: String(attribute.description?.ua || "").trim(),
    en: String(attribute.description?.en || "").trim(),
  },
  aliases: Array.isArray(attribute.aliases) ? attribute.aliases : [],
  sortOrder: Number(attribute.sortOrder || 0),
  isActive: attribute.isActive !== false,
  createdAt: attribute.createdAt || null,
  updatedAt: attribute.updatedAt || null,
});

const serializeDictionaryItem = (item, config) =>
  (config?.serialize || ((value) => serializeProductAttribute(value, config?.kind || "")))(item);

const getDictionarySort = (config = {}) =>
  config?.kind === "color" ? { key: 1 } : { sortOrder: 1, key: 1 };

const listProductAttributesByKind = (kind, { activeOnly = true } = {}) => async (_req, res, next) => {
  try {
    const config = getProductAttributeConfig(kind);
    if (!config) throw createHttpError(404, "Product attribute dictionary not found");

    const items = await config.model.find(activeOnly ? { isActive: { $ne: false } } : {})
      .sort(getDictionarySort(config))
      .lean();
    res.json(items.map((item) => serializeDictionaryItem(item, { ...config, kind })));
  } catch (error) {
    next(error);
  }
};

const getProductAttributeDictionariesByMode = ({ activeOnly = true } = {}) => async (_req, res, next) => {
  try {
    const entries = await Promise.all(
      PRODUCT_ATTRIBUTE_DICTIONARIES.map(async (config) => {
        const { kind, responseField, model } = config;
        const items = await model.find(activeOnly ? { isActive: { $ne: false } } : {})
          .sort(getDictionarySort(config))
          .lean();
        return [responseField, items.map((item) => serializeDictionaryItem(item, config))];
      })
    );
    const dictionaries = Object.fromEntries(entries);

    res.json(dictionaries);
  } catch (error) {
    next(error);
  }
};

const createProductAttributeForKind = (kind) => async (req, res, next) => {
  try {
    const config = getProductAttributeConfig(kind);
    if (!config) throw createHttpError(404, "Product attribute dictionary not found");

    const key = normalizeKey(req.body.key || req.body.name?.en || req.body.name?.ua || req.body.name);
    if (!key) throw createHttpError(400, "key is required");

    const attribute = await config.model.create({
      key,
      name: parseAttributeLocalizedName(req.body.name, key),
      description: parseLocalizedDescription(req.body.description),
      aliases: parseAliasKeys(req.body.aliases),
      sortOrder: parseSortOrder(req.body.sortOrder),
      isActive: parseBoolean(req.body.isActive, true),
    });

    res.status(201).json(serializeProductAttribute(attribute.toObject(), kind));
  } catch (error) {
    handleDuplicateKey(error, next, "Product attribute");
  }
};

export const updateProductAttribute = async (req, res, next) => {
  try {
    const update = {};
    if (req.body.key !== undefined) {
      update.key = normalizeKey(req.body.key);
      if (!update.key) throw createHttpError(400, "key is required");
    }
    if (req.body.name !== undefined) {
      update.name = parseAttributeLocalizedName(req.body.name, update.key);
    }
    if (req.body.description !== undefined) {
      update.description = parseLocalizedDescription(req.body.description);
    }
    if (req.body.aliases !== undefined) update.aliases = parseAliasKeys(req.body.aliases);
    if (req.body.sortOrder !== undefined) update.sortOrder = parseSortOrder(req.body.sortOrder);
    if (req.body.isActive !== undefined) update.isActive = parseBoolean(req.body.isActive, true);

    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) {
      throw createHttpError(400, "Product attribute not found");
    }

    for (const { kind, model } of PRODUCT_ATTRIBUTE_DICTIONARIES) {
      // eslint-disable-next-line no-await-in-loop
      const attribute = await model.findByIdAndUpdate(req.params.id, update, {
        new: true,
        runValidators: true,
      });
      if (attribute) return res.json(serializeProductAttribute(attribute.toObject(), kind));
    }

    throw createHttpError(404, "Product attribute not found");
  } catch (error) {
    if (error?.name === "CastError") {
      return next(createHttpError(400, "Product attribute not found"));
    }
    return handleDuplicateKey(error, next, "Product attribute");
  }
};

export const deleteProductAttribute = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) {
      throw createHttpError(400, "Product attribute not found");
    }

    for (const { kind, model } of PRODUCT_ATTRIBUTE_DICTIONARIES) {
      // eslint-disable-next-line no-await-in-loop
      const attribute = await model.findByIdAndDelete(req.params.id);
      if (attribute) {
        return res.json({ ok: true, removed: { id: String(attribute._id), key: attribute.key, kind } });
      }
    }

    throw createHttpError(404, "Product attribute not found");
  } catch (error) {
    if (error?.name === "CastError") {
      return next(createHttpError(400, "Product attribute not found"));
    }
    return next(error);
  }
};

export const getProductAttributeDictionaries = getProductAttributeDictionariesByMode({
  activeOnly: true,
});
export const getAdminProductAttributeDictionaries = getProductAttributeDictionariesByMode({
  activeOnly: false,
});
export const getProductRoomAttributes = listProductAttributesByKind("room", { activeOnly: true });
export const getProductStyleAttributes = listProductAttributesByKind("style", { activeOnly: true });
export const getProductCollectionAttributes = listProductAttributesByKind("collection", { activeOnly: true });
export const getAdminProductRoomAttributes = listProductAttributesByKind("room", { activeOnly: false });
export const getAdminProductStyleAttributes = listProductAttributesByKind("style", { activeOnly: false });
export const getAdminProductCollectionAttributes = listProductAttributesByKind("collection", { activeOnly: false });
export const createProductRoomAttribute = createProductAttributeForKind("room");
export const createProductStyleAttribute = createProductAttributeForKind("style");
export const createProductCollectionAttribute = createProductAttributeForKind("collection");

export const getAdminColors = async (_req, res, next) => {
  try {
    const items = await Color.find({}).sort({ key: 1 }).lean();
    res.json(items.map((item) => serializeColorDocument(item)));
  } catch (error) {
    next(error);
  }
};

export const createColor = async (req, res, next) => {
  try {
    const payload = buildColorMutationPayload(req.body);
    const color = await Color.create(payload);
    res.status(201).json(serializeColorDocument(color.toObject()));
  } catch (error) {
    handleDuplicateKey(error, next, "Color");
  }
};

export const updateColor = async (req, res, next) => {
  try {
    const existingColor = await Color.findById(req.params.id);
    if (!existingColor) throw createHttpError(404, "Color not found");

    const payload = buildColorMutationPayload(req.body, existingColor.toObject());
    const color = await Color.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    if (!color) throw createHttpError(404, "Color not found");
    res.json(serializeColorDocument(color.toObject()));
  } catch (error) {
    if (error?.name === "CastError") {
      return next(createHttpError(400, "Color not found"));
    }
    handleDuplicateKey(error, next, "Color");
  }
};

export const deleteColor = async (req, res, next) => {
  try {
    const color = await Color.findByIdAndDelete(req.params.id);
    if (!color) throw createHttpError(404, "Color not found");
    res.json({ ok: true, removed: { id: String(color._id), key: color.key } });
  } catch (error) {
    if (error?.name === "CastError") {
      return next(createHttpError(400, "Color not found"));
    }
    return next(error);
  }
};

export const getMaterials = async (_req, res, next) => {
  try {
    const items = await Material.find({}).sort({ key: 1 }).lean();
    res.json(items);
  } catch (error) {
    next(error);
  }
};

export const createMaterial = async (req, res, next) => {
  try {
    const key = normalizeKey(req.body.key);
    if (!key) throw createHttpError(400, "key is required");

    const material = await Material.create({
      key,
      name: parseLocalizedName(req.body.name),
      description: parseLocalizedDescription(req.body.description),
    });

    res.status(201).json(material);
  } catch (error) {
    handleDuplicateKey(error, next, "Material");
  }
};

export const updateMaterial = async (req, res, next) => {
  try {
    const update = {};
    if (req.body.key !== undefined) {
      update.key = normalizeKey(req.body.key);
      if (!update.key) throw createHttpError(400, "key is required");
    }
    if (req.body.name !== undefined) update.name = parseLocalizedName(req.body.name);
    if (req.body.description !== undefined) {
      update.description = parseLocalizedDescription(req.body.description);
    }

    const material = await Material.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    if (!material) throw createHttpError(404, "Material not found");

    res.json(material);
  } catch (error) {
    if (error?.name === "CastError") return next(createHttpError(400, "Material not found"));
    handleDuplicateKey(error, next, "Material");
  }
};

export const deleteMaterial = async (req, res, next) => {
  try {
    const material = await Material.findByIdAndDelete(req.params.id);
    if (!material) throw createHttpError(404, "Material not found");
    res.json({ ok: true, removed: { id: String(material._id), key: material.key } });
  } catch (error) {
    if (error?.name === "CastError") return next(createHttpError(400, "Material not found"));
    return next(error);
  }
};

export const getManufacturers = async (_req, res, next) => {
  try {
    const items = await Manufacturer.find({}).sort({ name: 1 }).lean();
    res.json(items);
  } catch (error) {
    next(error);
  }
};

export const createManufacturer = async (req, res, next) => {
  try {
    const key = normalizeKey(req.body.key || req.body.name);
    const name = String(req.body.name || "").trim();
    if (!key) throw createHttpError(400, "key is required");
    if (!name) throw createHttpError(400, "name is required");

    const manufacturer = await Manufacturer.create({
      key,
      name,
      country: String(req.body.country || "").trim(),
      website: String(req.body.website || "").trim(),
    });

    res.status(201).json(manufacturer);
  } catch (error) {
    handleDuplicateKey(error, next, "Manufacturer");
  }
};

export const updateManufacturer = async (req, res, next) => {
  try {
    const update = {};
    if (req.body.key !== undefined) {
      update.key = normalizeKey(req.body.key);
      if (!update.key) throw createHttpError(400, "key is required");
    }
    if (req.body.name !== undefined) {
      update.name = String(req.body.name || "").trim();
      if (!update.name) throw createHttpError(400, "name is required");
    }
    if (req.body.country !== undefined) update.country = String(req.body.country || "").trim();
    if (req.body.website !== undefined) update.website = String(req.body.website || "").trim();

    const manufacturer = await Manufacturer.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    if (!manufacturer) throw createHttpError(404, "Manufacturer not found");

    res.json(manufacturer);
  } catch (error) {
    if (error?.name === "CastError") return next(createHttpError(400, "Manufacturer not found"));
    handleDuplicateKey(error, next, "Manufacturer");
  }
};

export const deleteManufacturer = async (req, res, next) => {
  try {
    const manufacturer = await Manufacturer.findByIdAndDelete(req.params.id);
    if (!manufacturer) throw createHttpError(404, "Manufacturer not found");
    res.json({ ok: true, removed: { id: String(manufacturer._id), key: manufacturer.key } });
  } catch (error) {
    if (error?.name === "CastError") return next(createHttpError(400, "Manufacturer not found"));
    return next(error);
  }
};
