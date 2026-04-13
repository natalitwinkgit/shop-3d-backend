import mongoose from "mongoose";

import Manufacturer from "../models/Manufacturer.js";
import Material from "../models/Material.js";
import ProductCollection from "../models/ProductCollection.js";
import ProductRoom from "../models/ProductRoom.js";
import ProductStyle from "../models/ProductStyle.js";
import { createHttpError } from "../services/productPayloadService.js";

const PRODUCT_ATTRIBUTE_DICTIONARIES = [
  { kind: "room", responseField: "rooms", model: ProductRoom },
  { kind: "style", responseField: "styles", model: ProductStyle },
  { kind: "collection", responseField: "collections", model: ProductCollection },
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

const listProductAttributesByKind = (kind, { activeOnly = true } = {}) => async (_req, res, next) => {
  try {
    const config = getProductAttributeConfig(kind);
    if (!config) throw createHttpError(404, "Product attribute dictionary not found");

    const items = await config.model.find(activeOnly ? { isActive: { $ne: false } } : {})
      .sort({ sortOrder: 1, key: 1 })
      .lean();
    res.json(items.map((item) => serializeProductAttribute(item, kind)));
  } catch (error) {
    next(error);
  }
};

const getProductAttributeDictionariesByMode = ({ activeOnly = true } = {}) => async (_req, res, next) => {
  try {
    const entries = await Promise.all(
      PRODUCT_ATTRIBUTE_DICTIONARIES.map(async ({ kind, responseField, model }) => {
        const items = await model.find(activeOnly ? { isActive: { $ne: false } } : {})
          .sort({ sortOrder: 1, key: 1 })
          .lean();
        return [responseField, items.map((item) => serializeProductAttribute(item, kind))];
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
