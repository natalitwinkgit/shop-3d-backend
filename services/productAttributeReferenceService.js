import ProductCollection from "../models/ProductCollection.js";
import ProductRoom from "../models/ProductRoom.js";
import ProductStyle from "../models/ProductStyle.js";
import {
  normalizeCollectionKeys,
  normalizeRoomKeys,
  normalizeStyleKeys,
} from "./catalogNormalizationService.js";
import { createHttpError } from "./productPayloadService.js";

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const ATTRIBUTE_CONFIGS = [
  {
    field: "roomKeys",
    responseField: "rooms",
    kind: "room",
    model: ProductRoom,
    normalize: normalizeRoomKeys,
  },
  {
    field: "styleKeys",
    responseField: "styles",
    kind: "style",
    model: ProductStyle,
    normalize: normalizeStyleKeys,
  },
  {
    field: "collectionKeys",
    responseField: "collections",
    kind: "collection",
    model: ProductCollection,
    normalize: normalizeCollectionKeys,
  },
];

const toLabel = (key = "") =>
  String(key || "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");

const serializeAttribute = (attribute, fallbackKey = "", kind = "") => {
  const key = String(attribute?.key || fallbackKey || "").trim();
  const fallbackLabel = toLabel(key);

  return {
    _id: attribute?._id ? String(attribute._id) : "",
    kind,
    key,
    name: {
      ua: String(attribute?.name?.ua || attribute?.name?.en || fallbackLabel).trim(),
      en: String(attribute?.name?.en || attribute?.name?.ua || fallbackLabel).trim(),
    },
    description: {
      ua: String(attribute?.description?.ua || "").trim(),
      en: String(attribute?.description?.en || "").trim(),
    },
    aliases: Array.isArray(attribute?.aliases) ? attribute.aliases : [],
    sortOrder: Number(attribute?.sortOrder || 0),
    isActive: attribute?.isActive !== false,
  };
};

const collectKeysByKind = (products = []) =>
  products.reduce((acc, product) => {
    ATTRIBUTE_CONFIGS.forEach(({ field, kind, normalize }) => {
      normalize(product?.[field] || []).forEach((key) => acc[kind].add(key));
    });
    return acc;
  }, {
    room: new Set(),
    style: new Set(),
    collection: new Set(),
  });

const loadAttributesByKindAndKey = async (keysByKind) => {
  const loadedEntries = await Promise.all(
    ATTRIBUTE_CONFIGS.map(async ({ kind, model }) => {
      const keys = keysByKind[kind] || new Set();
      const attributes = keys.size
        ? await model.find({ key: { $in: Array.from(keys) } }).lean()
        : [];
      return [
        kind,
        new Map(attributes.map((attribute) => [attribute.key, attribute])),
      ];
    })
  );

  return new Map(loadedEntries);
};

export const attachProductAttributeReferencesToProducts = async (input) => {
  const isArray = Array.isArray(input);
  const products = (isArray ? input : [input]).filter(Boolean);
  if (!products.length) return input;

  const keysByKind = collectKeysByKind(products);
  const attributesByKind = await loadAttributesByKindAndKey(keysByKind);

  const hydrated = products.map((product) => {
    const nextProduct = { ...product };

    ATTRIBUTE_CONFIGS.forEach(({ field, responseField, kind, normalize }) => {
      const normalizedKeys = normalize(nextProduct[field] || []);
      const attributeMap = attributesByKind.get(kind) || new Map();
      nextProduct[field] = normalizedKeys;
      nextProduct[responseField] = normalizedKeys.map((key) =>
        serializeAttribute(attributeMap.get(key), key, kind)
      );
    });

    return nextProduct;
  });

  return isArray ? hydrated : hydrated[0];
};

export const resolveProductAttributeKeys = async (payload = {}) => {
  if (!isPlainObject(payload)) return payload;

  const nextPayload = { ...payload };
  const checks = ATTRIBUTE_CONFIGS.filter(({ field }) => Array.isArray(nextPayload[field]));
  if (!checks.length) return nextPayload;

  await Promise.all(
    checks.map(async ({ field, kind, model, normalize }) => {
      const normalizedKeys = normalize(nextPayload[field]);
      nextPayload[field] = normalizedKeys;
      if (!normalizedKeys.length) return;

      const availableAttributes = await model.find({ isActive: { $ne: false } })
        .select("key")
        .lean();
      if (!availableAttributes.length) return;

      const allowedKeys = new Set(availableAttributes.map((item) => item.key));
      const unknownKeys = normalizedKeys.filter((key) => !allowedKeys.has(key));
      if (unknownKeys.length) {
        throw createHttpError(400, `${field} contain unknown keys: ${unknownKeys.join(", ")}`);
      }
    })
  );

  return nextPayload;
};
