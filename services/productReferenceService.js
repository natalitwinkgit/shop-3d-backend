import mongoose from "mongoose";

import Manufacturer from "../models/Manufacturer.js";
import Material from "../models/Material.js";
import { createHttpError } from "./productPayloadService.js";

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

const normalizeKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const serializeMaterial = (material) => {
  if (!material || !isPlainObject(material)) return null;

  return {
    _id: String(material._id || material.id || ""),
    key: String(material.key || "").trim(),
    name: {
      ua: String(material.name?.ua || material.name?.en || "").trim(),
      en: String(material.name?.en || material.name?.ua || "").trim(),
    },
    description: {
      ua: String(material.description?.ua || "").trim(),
      en: String(material.description?.en || "").trim(),
    },
  };
};

const serializeManufacturer = (manufacturer) => {
  if (!manufacturer || !isPlainObject(manufacturer)) return null;

  return {
    _id: String(manufacturer._id || manufacturer.id || ""),
    key: String(manufacturer.key || "").trim(),
    name: String(manufacturer.name || "").trim(),
    country: String(manufacturer.country || "").trim(),
    website: String(manufacturer.website || "").trim(),
  };
};

const getObjectId = (value) => {
  if (!value) return "";
  if (mongoose.Types.ObjectId.isValid(String(value))) return String(value);
  if (isPlainObject(value) && mongoose.Types.ObjectId.isValid(String(value._id || value.id))) {
    return String(value._id || value.id);
  }

  return "";
};

const getReferenceInput = (value) => {
  if (!value) return "";
  if (isPlainObject(value)) return String(value._id || value.id || value.key || "").trim();
  return String(value).trim();
};

const findMaterialReference = async (value, { required = false } = {}) => {
  const input = getReferenceInput(value);
  if (!input) return null;

  const query = mongoose.Types.ObjectId.isValid(input)
    ? { _id: input }
    : { key: normalizeKey(input) };
  const material = await Material.findOne(query).lean();
  if (!material && required) throw createHttpError(400, "specifications.material was not found");

  return material;
};

const findManufacturerReference = async (value, { required = false } = {}) => {
  const input = getReferenceInput(value);
  if (!input) return null;

  const query = mongoose.Types.ObjectId.isValid(input)
    ? { _id: input }
    : { key: normalizeKey(input) };
  const manufacturer = await Manufacturer.findOne(query).lean();
  if (!manufacturer && required) {
    throw createHttpError(400, "specifications.manufacturer was not found");
  }

  return manufacturer;
};

const collectReferenceInputs = (products = []) => {
  const materialIds = new Set();
  const materialKeys = new Set();
  const manufacturerIds = new Set();
  const manufacturerKeys = new Set();

  products.forEach((product) => {
    const specifications = isPlainObject(product?.specifications) ? product.specifications : {};

    const materialId = getObjectId(specifications.material);
    if (materialId) materialIds.add(materialId);
    if (specifications.materialKey) materialKeys.add(normalizeKey(specifications.materialKey));
    if (Array.isArray(specifications.materialKeys)) {
      specifications.materialKeys.forEach((key) => materialKeys.add(normalizeKey(key)));
    }

    const manufacturerId = getObjectId(specifications.manufacturer);
    if (manufacturerId) manufacturerIds.add(manufacturerId);
    if (specifications.manufacturerKey) manufacturerKeys.add(normalizeKey(specifications.manufacturerKey));
  });

  return { materialIds, materialKeys, manufacturerIds, manufacturerKeys };
};

export const attachReferenceDictionariesToProducts = async (input) => {
  const products = Array.isArray(input) ? input : [input];
  if (!products.length) return input;

  const { materialIds, materialKeys, manufacturerIds, manufacturerKeys } =
    collectReferenceInputs(products);
  const materialClauses = [
    ...(materialIds.size ? [{ _id: { $in: Array.from(materialIds) } }] : []),
    ...(materialKeys.size ? [{ key: { $in: Array.from(materialKeys) } }] : []),
  ];
  const manufacturerClauses = [
    ...(manufacturerIds.size ? [{ _id: { $in: Array.from(manufacturerIds) } }] : []),
    ...(manufacturerKeys.size ? [{ key: { $in: Array.from(manufacturerKeys) } }] : []),
  ];

  const [materials, manufacturers] = await Promise.all([
    materialClauses.length ? Material.find({ $or: materialClauses }).lean() : [],
    manufacturerClauses.length ? Manufacturer.find({ $or: manufacturerClauses }).lean() : [],
  ]);

  const materialById = new Map(materials.map((item) => [String(item._id), item]));
  const materialByKey = new Map(materials.map((item) => [normalizeKey(item.key), item]));
  const manufacturerById = new Map(manufacturers.map((item) => [String(item._id), item]));
  const manufacturerByKey = new Map(manufacturers.map((item) => [normalizeKey(item.key), item]));

  const hydrated = products.map((product) => {
    const specifications = isPlainObject(product?.specifications) ? { ...product.specifications } : {};
    const material =
      materialById.get(getObjectId(specifications.material)) ||
      materialByKey.get(normalizeKey(specifications.materialKey));
    const manufacturer =
      manufacturerById.get(getObjectId(specifications.manufacturer)) ||
      manufacturerByKey.get(normalizeKey(specifications.manufacturerKey));

    return {
      ...product,
      specifications: {
        ...specifications,
        ...(material ? { material: serializeMaterial(material) } : {}),
        ...(manufacturer ? { manufacturer: serializeManufacturer(manufacturer) } : {}),
      },
    };
  });

  return Array.isArray(input) ? hydrated : hydrated[0];
};

export const resolveProductSpecificationReferences = async (payload = {}, { sourceBody = {} } = {}) => {
  if (!isPlainObject(payload.specifications)) return payload;

  const specifications = { ...payload.specifications };
  const sourceSpecifications = isPlainObject(sourceBody.specifications)
    ? sourceBody.specifications
    : {};
  const materialWasProvided =
    hasOwn(sourceSpecifications, "material") ||
    hasOwn(sourceSpecifications, "materialId") ||
    hasOwn(sourceBody, "materialId");
  const manufacturerWasProvided =
    hasOwn(sourceSpecifications, "manufacturer") ||
    hasOwn(sourceSpecifications, "manufacturerId") ||
    hasOwn(sourceBody, "manufacturerId");
  const materialInput = specifications.material ?? specifications.materialId;
  const manufacturerInput = specifications.manufacturer ?? specifications.manufacturerId;
  const [material, manufacturer] = await Promise.all([
    findMaterialReference(materialInput ?? specifications.materialKey, {
      required: materialWasProvided && Boolean(materialInput),
    }),
    findManufacturerReference(
      manufacturerInput ?? specifications.manufacturerKey,
      { required: manufacturerWasProvided && Boolean(manufacturerInput) }
    ),
  ]);

  if (material) {
    const materialKey = normalizeKey(material.key);
    const materialKeys = Array.from(
      new Set([
        materialKey,
        ...(Array.isArray(specifications.materialKeys) ? specifications.materialKeys.map(normalizeKey) : []),
      ].filter(Boolean))
    );

    specifications.material = material._id;
    specifications.materialKey = materialKey;
    specifications.materialKeys = materialKeys;
    specifications.materials = materialKeys.map((key) => ({ key, label: key.replace(/_/g, " ") }));
    delete specifications.materialId;
  }

  if (manufacturer) {
    specifications.manufacturer = manufacturer._id;
    specifications.manufacturerKey = normalizeKey(manufacturer.key);
    delete specifications.manufacturerId;
  }

  return { ...payload, specifications };
};
