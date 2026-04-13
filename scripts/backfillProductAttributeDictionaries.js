import mongoose from "mongoose";

import "../config/env.js";
import ProductCollection from "../models/ProductCollection.js";
import Product from "../models/Product.js";
import ProductRoom from "../models/ProductRoom.js";
import ProductStyle from "../models/ProductStyle.js";
import {
  ROOM_KEY_ALIASES,
  normalizeCollectionKeys,
  normalizeRoomKeys,
  normalizeStyleKeys,
} from "../services/catalogNormalizationService.js";

const LEGACY_ATTRIBUTE_KINDS = ["room", "style", "collection"];
const legacyProductAttributeSchema = new mongoose.Schema({}, { strict: false, collection: "productattributes" });
const LegacyProductAttribute =
  mongoose.models.LegacyProductAttribute ||
  mongoose.model("LegacyProductAttribute", legacyProductAttributeSchema);

const DEFAULT_ROOMS = [
  { key: "living_room", name: { ua: "Вітальня", en: "Living room" } },
  { key: "bedroom", name: { ua: "Спальня", en: "Bedroom" } },
  { key: "bathroom", name: { ua: "Ванна кімната", en: "Bathroom" } },
  { key: "kids_room", name: { ua: "Дитяча кімната", en: "Kids room" } },
  { key: "home_office", name: { ua: "Домашній офіс", en: "Home office" } },
  { key: "dining_room", name: { ua: "Їдальня", en: "Dining room" } },
  { key: "hallway", name: { ua: "Передпокій", en: "Hallway" } },
  { key: "kitchen", name: { ua: "Кухня", en: "Kitchen" } },
];

const DEFAULT_STYLES = [
  { key: "modern", name: { ua: "Модерн", en: "Modern" } },
  { key: "minimal", name: { ua: "Мінімалізм", en: "Minimal" } },
  { key: "scandinavian", name: { ua: "Скандинавський", en: "Scandinavian" } },
  { key: "contemporary", name: { ua: "Сучасний", en: "Contemporary" } },
  { key: "soft", name: { ua: "М'який", en: "Soft" } },
  { key: "accent", name: { ua: "Акцентний", en: "Accent" } },
  { key: "urban", name: { ua: "Урбан", en: "Urban" } },
  { key: "clean", name: { ua: "Чистий", en: "Clean" } },
  { key: "ergonomic", name: { ua: "Ергономічний", en: "Ergonomic" } },
  { key: "premium", name: { ua: "Преміум", en: "Premium" } },
  { key: "practical", name: { ua: "Практичний", en: "Practical" } },
  { key: "loft", name: { ua: "Лофт", en: "Loft" } },
];

const DEFAULT_COLLECTIONS = [
  { key: "luna_bedroom", name: { ua: "Luna Bedroom", en: "Luna Bedroom" } },
  { key: "arco_living", name: { ua: "Arco Living", en: "Arco Living" } },
  { key: "teddy_accent", name: { ua: "Teddy Accent", en: "Teddy Accent" } },
  { key: "nordic_dining", name: { ua: "Nordic Dining", en: "Nordic Dining" } },
  { key: "milo_dining", name: { ua: "Milo Dining", en: "Milo Dining" } },
  { key: "frame_media", name: { ua: "Frame Media", en: "Frame Media" } },
  { key: "mirror_storage", name: { ua: "Mirror Storage", en: "Mirror Storage" } },
  { key: "core_office", name: { ua: "Core Office", en: "Core Office" } },
  { key: "demo_curated", name: { ua: "Demo Curated", en: "Demo Curated" } },
  { key: "demo_signature", name: { ua: "Demo Signature", en: "Demo Signature" } },
];

const keyToLabel = (key = "") =>
  String(key || "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");

const toLocalizedName = (key) => {
  const label = keyToLabel(key);
  return { ua: label, en: label };
};

const normalizeDictionaryKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const normalizeAliases = (aliases = []) =>
  Array.from(
    new Set((Array.isArray(aliases) ? aliases : []).map(normalizeDictionaryKey).filter(Boolean))
  );

const ATTRIBUTE_DICTIONARIES = [
  { kind: "room", model: ProductRoom },
  { kind: "style", model: ProductStyle },
  { kind: "collection", model: ProductCollection },
];

const getAttributeDictionary = (kind) =>
  ATTRIBUTE_DICTIONARIES.find((dictionary) => dictionary.kind === kind);

const toAttributeDocument = (key, name, extra = {}) => {
  const normalizedKey = normalizeDictionaryKey(key);
  return {
    key: normalizedKey,
    name: name || toLocalizedName(normalizedKey),
    description: extra.description || { ua: "", en: "" },
    aliases: normalizeAliases(extra.aliases),
    sortOrder: extra.sortOrder ?? 0,
    isActive: extra.isActive !== false,
    ...(extra._id ? { _id: extra._id } : {}),
  };
};

const upsertAttribute = (kind, key, name, extra = {}) => {
  const dictionary = getAttributeDictionary(kind);
  if (!dictionary) throw new Error(`Unknown product attribute dictionary: ${kind}`);
  const document = toAttributeDocument(key, name, extra);

  return dictionary.model.updateOne(
    { key: document.key },
    {
      $setOnInsert: document,
    },
    { upsert: true }
  );
};

const migrateLegacyProductAttributes = async () => {
  const legacyAttributes = await LegacyProductAttribute.find({
    kind: { $in: LEGACY_ATTRIBUTE_KINDS },
  }).lean();

  if (!legacyAttributes.length) return 0;

  await Promise.all(
    legacyAttributes.map((attribute) =>
      upsertAttribute(
        attribute.kind,
        attribute.key,
        attribute.name || toLocalizedName(attribute.key),
        {
          _id: attribute._id,
          description: attribute.description,
          aliases: attribute.aliases,
          sortOrder: attribute.sortOrder,
          isActive: attribute.isActive,
        }
      )
    )
  );

  return legacyAttributes.length;
};

const dropLegacyProductAttributesCollection = async () => {
  const exists = await mongoose.connection.db
    .listCollections({ name: "productattributes" })
    .hasNext();
  if (!exists) return false;

  await mongoose.connection.db.dropCollection("productattributes");
  return true;
};

const loadDistinctProductKeys = async (field, normalizer) => {
  const values = await Product.distinct(field);
  return normalizer(values);
};

const arraysMatch = (left = [], right = []) =>
  left.length === right.length && left.every((item, index) => item === right[index]);

const normalizeProductAttributeKeys = async () => {
  const products = await Product.find({})
    .select("_id roomKeys styleKeys collectionKeys")
    .lean();
  let updated = 0;

  for (const product of products) {
    const roomKeys = normalizeRoomKeys(product.roomKeys || []);
    const styleKeys = normalizeStyleKeys(product.styleKeys || []);
    const collectionKeys = normalizeCollectionKeys(product.collectionKeys || []);

    if (
      arraysMatch(roomKeys, product.roomKeys || []) &&
      arraysMatch(styleKeys, product.styleKeys || []) &&
      arraysMatch(collectionKeys, product.collectionKeys || [])
    ) {
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    await Product.updateOne(
      { _id: product._id },
      { $set: { roomKeys, styleKeys, collectionKeys } }
    );
    updated += 1;
  }

  return updated;
};

const run = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGO_URL || process.env.DATABASE_URL;
  if (!uri) throw new Error("MONGO_URI is not configured");

  await mongoose.connect(uri);
  const migratedLegacyAttributes = await migrateLegacyProductAttributes();
  const normalizedProducts = await normalizeProductAttributeKeys();

  const [productRoomKeys, styleKeys, collectionKeys] = await Promise.all([
    loadDistinctProductKeys("roomKeys", normalizeRoomKeys),
    loadDistinctProductKeys("styleKeys", normalizeStyleKeys),
    loadDistinctProductKeys("collectionKeys", normalizeCollectionKeys),
  ]);

  const defaultRoomMap = new Map(DEFAULT_ROOMS.map((room, index) => [room.key, { ...room, sortOrder: index }]));
  const defaultStyleMap = new Map(DEFAULT_STYLES.map((style, index) => [style.key, { ...style, sortOrder: index }]));
  const defaultCollectionMap = new Map(DEFAULT_COLLECTIONS.map((collection, index) => [collection.key, { ...collection, sortOrder: index }]));
  const roomKeys = Array.from(new Set([...DEFAULT_ROOMS.map((room) => room.key), ...productRoomKeys]));
  const allStyleKeys = Array.from(new Set([...DEFAULT_STYLES.map((style) => style.key), ...styleKeys]));
  const allCollectionKeys = Array.from(
    new Set([...DEFAULT_COLLECTIONS.map((collection) => collection.key), ...collectionKeys])
  );

  await Promise.all([
    ...roomKeys.map((key, index) => {
      const room = defaultRoomMap.get(key);
      return upsertAttribute("room", key, room?.name || toLocalizedName(key), {
        aliases: ROOM_KEY_ALIASES[key] || [],
        sortOrder: room?.sortOrder ?? index,
      });
    }),
    ...allStyleKeys.map((key, index) => {
      const style = defaultStyleMap.get(key);
      return upsertAttribute("style", key, style?.name || toLocalizedName(key), {
        sortOrder: style?.sortOrder ?? index,
      });
    }),
    ...allCollectionKeys.map((key, index) => {
      const collection = defaultCollectionMap.get(key);
      return upsertAttribute("collection", key, collection?.name || toLocalizedName(key), {
        sortOrder: collection?.sortOrder ?? index,
      });
    }),
  ]);

  const counts = Object.fromEntries(
    await Promise.all(
      ATTRIBUTE_DICTIONARIES.map(async ({ kind, model }) => [kind, await model.countDocuments({})])
    )
  );
  const collections = Object.fromEntries(
    ATTRIBUTE_DICTIONARIES.map(({ kind, model }) => [kind, model.collection.name])
  );
  const droppedLegacyProductAttributes = await dropLegacyProductAttributesCollection();

  console.log(
    JSON.stringify(
      {
        ok: true,
        normalizedProducts,
        migratedLegacyAttributes,
        droppedLegacyProductAttributes,
        collections,
        counts,
      },
      null,
      2
    )
  );
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Failed to backfill product attribute dictionaries:", error);
  await mongoose.disconnect().catch(() => null);
  process.exit(1);
});
