import Manufacturer from "../models/Manufacturer.js";
import Material from "../models/Material.js";
import { createHttpError } from "../services/productPayloadService.js";

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
