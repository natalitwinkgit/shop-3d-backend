// controllers/productController.js
import mongoose from "mongoose";
import Product from "../models/Product.js";
import Inventory from "../models/Inventory.js";
import {
  expandRoomQueryKeys,
  normalizeMaterialKeys,
  normalizeProductCatalogPayload,
  normalizeRoomKeys,
} from "../services/catalogNormalizationService.js";
import { attachColorReferencesToProducts } from "../services/productColorReferenceService.js";
import {
  attachReferenceDictionariesToProducts,
  resolveProductSpecificationReferences,
} from "../services/productReferenceService.js";
import {
  buildProductMutationPayload,
  createHttpError,
} from "../services/productPayloadService.js";

const ensureObjectId = (value, fieldName = "Product id") => {
  if (!mongoose.Types.ObjectId.isValid(String(value || ""))) {
    throw createHttpError(400, `${fieldName} is invalid`);
  }
};

const forwardControllerError = (error, next, scope, fallbackMessage) => {
  if (error?.statusCode || error?.status) return next(error);
  console.error(`[${scope}] error:`, error);
  return next(createHttpError(500, fallbackMessage));
};

/* =========================
    Query helpers
========================= */
const isEmpty = (v) => v === undefined || v === null || String(v).trim() === "";
const toNumberOrNull = (v) => (isEmpty(v) ? null : Number(v));
const truthy = (v) => ["1", "true", "yes", "on"].includes(String(v).toLowerCase());

const getQueryParam = (req, key) => {
  if (req?.query?.[key] !== undefined) return req.query[key];
  if (req?.query?.[`${key}[]`] !== undefined) return req.query[`${key}[]`];
  return undefined;
};

const parseCsv = (v) => {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) {
    const arr = v.map((x) => String(x).trim()).filter(Boolean);
    return arr.length ? arr : null;
  }
  const raw = String(v);
  const items = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return items.length ? items : null;
};

const mergeCsvInputs = (...values) =>
  Array.from(
    new Set(
      values
        .flatMap((value) => parseCsv(value) || [])
        .map((item) => String(item).trim())
        .filter(Boolean)
    )
  );

const addRange = (obj, field, minV, maxV) => {
  const min = toNumberOrNull(minV);
  const max = toNumberOrNull(maxV);
  if (min === null && max === null) return;
  obj[field] = obj[field] && typeof obj[field] === "object" ? obj[field] : {};
  if (min !== null) obj[field].$gte = min;
  if (max !== null) obj[field].$lte = max;
};

const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* =======================
    Facets helpers
======================= */
const cleanUniq = (arr) =>
  Array.from(
    new Set(
      (arr || [])
        .flat()
        .map((x) => String(x || "").trim())
        .filter(Boolean)
    )
  ).sort();

const normalizeFacetValues = (values, normalizer) =>
  Array.from(
    new Set(
      (values || [])
        .flat()
        .map((value) => normalizer(value))
        .filter(Boolean)
    )
  ).sort();

const buildMaterialFilter = (values) => {
  const materialKeys = normalizeMaterialKeys(values);
  if (!materialKeys.length) return null;

  return {
    $or: [
      { "specifications.materialKey": { $in: materialKeys } },
      { "specifications.materialKeys": { $in: materialKeys } },
      { "specifications.materials.key": { $in: materialKeys } },
      { "specifications.materials": { $in: materialKeys } },
    ],
  };
};

const buildProductCollectionFilter = (req) => {
  const clauses = [];

  const category = getQueryParam(req, "category");
  const subCategory = getQueryParam(req, "subCategory");
  const typeKey = getQueryParam(req, "typeKey");

  const colorKeys = parseCsv(getQueryParam(req, "colorKeys"));
  const styleKeys = parseCsv(getQueryParam(req, "styleKeys"));
  const roomKeys = mergeCsvInputs(getQueryParam(req, "roomKeys"));
  const collectionKeys = parseCsv(getQueryParam(req, "collectionKeys"));

  const materialKeys = mergeCsvInputs(
    getQueryParam(req, "materialKeys"),
    getQueryParam(req, "materialKey")
  );
  const manufacturerKeys = mergeCsvInputs(
    getQueryParam(req, "manufacturerKeys"),
    getQueryParam(req, "manufacturerKey")
  );

  const priceMin = getQueryParam(req, "priceMin");
  const priceMax = getQueryParam(req, "priceMax");
  const hasModel = getQueryParam(req, "hasModel");
  const hasDiscount = getQueryParam(req, "hasDiscount");
  const q = getQueryParam(req, "q");

  if (!isEmpty(category)) clauses.push({ category: String(category).trim() });
  if (!isEmpty(subCategory) && subCategory !== "all") {
    clauses.push({ subCategory: String(subCategory).trim() });
  }
  if (!isEmpty(typeKey)) clauses.push({ typeKey: String(typeKey).trim() });

  if (colorKeys?.length) clauses.push({ colorKeys: { $in: colorKeys } });
  if (styleKeys?.length) clauses.push({ styleKeys: { $in: styleKeys } });
  if (collectionKeys?.length) clauses.push({ collectionKeys: { $in: collectionKeys } });
  if (roomKeys?.length) clauses.push({ roomKeys: { $in: expandRoomQueryKeys(roomKeys) } });

  const materialFilter = buildMaterialFilter(materialKeys);
  if (materialFilter) clauses.push(materialFilter);
  if (manufacturerKeys?.length) {
    clauses.push({ "specifications.manufacturerKey": { $in: manufacturerKeys } });
  }

  const rangeFilter = {};
  addRange(rangeFilter, "price", priceMin, priceMax);
  if (Object.keys(rangeFilter).length) clauses.push(rangeFilter);

  if (truthy(hasDiscount)) clauses.push({ discount: { $gt: 0 } });
  if (truthy(hasModel)) clauses.push({ modelUrl: { $exists: true, $ne: "" } });

  if (!isEmpty(q)) {
    const rx = new RegExp(escapeRegExp(q), "i");
    clauses.push({
      $or: [
        { "name.ua": rx },
        { "name.en": rx },
        { "description.ua": rx },
        { "description.en": rx },
        { sku: rx },
        { slug: rx },
      ],
    });
  }

  if (!clauses.length) return {};
  if (clauses.length === 1) return clauses[0];
  return { $and: clauses };
};

/* =======================
    ✅ GET /api/products/facets
======================= */
export const getProductFacets = async (req, res, next) => {
  try {
    const match = buildProductCollectionFilter(req);

    const [
      colorKeys,
      styleKeys,
      roomKeys,
      collectionKeys,
      materialKeySingles,
      materialKeyLists,
      manufacturerKeys,
    ] =
      await Promise.all([
        Product.distinct("colorKeys", match),
        Product.distinct("styleKeys", match),
        Product.distinct("roomKeys", match),
        Product.distinct("collectionKeys", match),
        Product.distinct("specifications.materialKey", match),
        Product.distinct("specifications.materialKeys", match),
        Product.distinct("specifications.manufacturerKey", match),
      ]);

    res.set("Cache-Control", "no-store");
    res.json({
      colorKeys: cleanUniq(colorKeys),
      styleKeys: cleanUniq(styleKeys),
      roomKeys: normalizeFacetValues(roomKeys, (value) => normalizeRoomKeys([value])[0]),
      collectionKeys: cleanUniq(collectionKeys),
      materialKeys: normalizeFacetValues(
        [...(materialKeySingles || []), ...(materialKeyLists || [])],
        (value) => normalizeMaterialKeys([value])[0]
      ),
      manufacturerKeys: cleanUniq(manufacturerKeys),
    });
  } catch (e) {
    forwardControllerError(e, next, "getProductFacets", "Internal server error");
  }
};

/* =======================
    ✅ GET /api/products
    inventory-first:
      - returns hasStock + availableTotal
      - supports query hasStock=1/0
      - reads inventories.product (NOT productId)
======================= */
export const getProducts = async (req, res, next) => {
  try {
    const hasStock = getQueryParam(req, "hasStock"); // ✅ inventory-first filter
    const sort = getQueryParam(req, "sort");
    const filter = buildProductCollectionFilter(req);

    let sortObj = { createdAt: -1 };
    switch (String(sort || "").toLowerCase()) {
      case "price_asc":
        sortObj = { price: 1 };
        break;
      case "price_desc":
        sortObj = { price: -1 };
        break;
      case "discount_desc":
        sortObj = { discount: -1 };
        break;
      case "updated":
        sortObj = { updatedAt: -1 };
        break;
      default:
        sortObj = { createdAt: -1 };
        break;
    }

    const pipeline = [
      { $match: filter },

      // ✅ FIX: inventories.product (бо в схемі Inventory поле "product")
      {
        $lookup: {
          from: "inventories",
          localField: "_id",
          foreignField: "product",
          as: "inv",
        },
      },

      // totals (empty inv -> 0)
      {
        $addFields: {
          onHandTotal: { $ifNull: [{ $sum: "$inv.onHand" }, 0] },
          reservedTotal: { $ifNull: [{ $sum: "$inv.reserved" }, 0] },
        },
      },

      {
        $addFields: {
          availableTotal: { $max: [0, { $subtract: ["$onHandTotal", "$reservedTotal"] }] },
          hasStock: { $gt: [{ $subtract: ["$onHandTotal", "$reservedTotal"] }, 0] },
        },
      },

      // ✅ фільтр по наявності
      ...(hasStock !== undefined ? [{ $match: { hasStock: truthy(hasStock) } }] : []),

      { $project: { inv: 0 } },
      { $sort: sortObj },
    ];

    const list = await Product.aggregate(pipeline);
    const hydrated = await attachReferenceDictionariesToProducts(
      await attachColorReferencesToProducts(list)
    );

    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json(hydrated.map((item) => normalizeProductCatalogPayload(item)));
  } catch (err) {
    forwardControllerError(err, next, "getProducts", "Internal server error");
  }
};

export const getProductRooms = async (_req, res, next) => {
  try {
    const items = await Product.aggregate([
      { $match: { status: { $ne: "archived" } } },
      { $unwind: "$roomKeys" },
      {
        $group: {
          _id: "$roomKeys",
          count: { $sum: 1 },
          coverImage: {
            $first: {
              $cond: [
                { $gt: [{ $strLenCP: { $ifNull: ["$previewImage", ""] } }, 0] },
                "$previewImage",
                { $arrayElemAt: ["$images", 0] },
              ],
            },
          },
        },
      },
      { $sort: { count: -1, _id: 1 } },
    ]);

    const roomMap = new Map();
    for (const item of items) {
      const key = normalizeRoomKeys([item._id])[0];
      if (!key) continue;

      const existing = roomMap.get(key);
      if (!existing) {
        roomMap.set(key, {
          key,
          count: Number(item.count || 0),
          coverImage: item.coverImage || "",
        });
        continue;
      }

      existing.count += Number(item.count || 0);
      if (!existing.coverImage && item.coverImage) {
        existing.coverImage = item.coverImage;
      }
    }

    res.set("Cache-Control", "no-store");
    res.json(Array.from(roomMap.values()).sort((left, right) => right.count - left.count));
  } catch (error) {
    forwardControllerError(error, next, "getProductRooms", "Internal server error");
  }
};

/* =======================
    ✅ GET /api/products/stats
    inventory-first stats:
      - group by inventories.product (NOT productId)
======================= */
export const getProductsStats = async (_req, res, next) => {
  try {
    const total = await Product.countDocuments();
    const hasDiscount = await Product.countDocuments({ discount: { $gt: 0 } });

    // ✅ FIX: group by product (бо в схемі Inventory поле "product")
    const inStockAgg = await Inventory.aggregate([
      {
        $group: {
          _id: "$product",
          onHandTotal: { $sum: "$onHand" },
          reservedTotal: { $sum: "$reserved" },
        },
      },
      { $addFields: { availableTotal: { $subtract: ["$onHandTotal", "$reservedTotal"] } } },
      { $match: { availableTotal: { $gt: 0 } } },
      { $count: "count" },
    ]);

    const inStock = inStockAgg?.[0]?.count || 0;

    res.json({
      total,
      inStock,
      outOfStock: Math.max(0, total - inStock),
      hasDiscount,
    });
  } catch (err) {
    forwardControllerError(err, next, "getProductsStats", "Статистика недоступна");
  }
};

/* =======================
    CRUD (як було)
======================= */
export const getProductBySlug = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || "").trim();
    if (!slug) {
      throw createHttpError(400, "Slug is required");
    }

    const product = await Product.findOne({ slug }).lean();
    if (!product) throw createHttpError(404, "Товар не знайдено");

    const hydrated = await attachReferenceDictionariesToProducts(
      await attachColorReferencesToProducts(product)
    );
    res.json(normalizeProductCatalogPayload(hydrated));
  } catch (err) {
    forwardControllerError(err, next, "getProductBySlug", "Помилка сервера");
  }
};

export const getProductById = async (req, res, next) => {
  try {
    ensureObjectId(req.params.id);

    const product = await Product.findById(req.params.id).lean();
    if (!product) throw createHttpError(404, "Товар не знайдено");

    const hydrated = await attachReferenceDictionariesToProducts(
      await attachColorReferencesToProducts(product)
    );
    res.json(normalizeProductCatalogPayload(hydrated));
  } catch (err) {
    forwardControllerError(err, next, "getProductById", "Помилка сервера");
  }
};

export const createProduct = async (req, res, next) => {
  try {
    const payload = await resolveProductSpecificationReferences(
      buildProductMutationPayload({
        body: req.body,
        partial: false,
        allowInventoryFields: false,
      }),
      { sourceBody: req.body }
    );

    const product = await Product.create(payload);
    const hydrated = await attachReferenceDictionariesToProducts(
      await attachColorReferencesToProducts(product.toObject())
    );
    res.status(201).json(normalizeProductCatalogPayload(hydrated));
  } catch (err) {
    if (err?.code === 11000) {
      return next(createHttpError(409, "Product slug must be unique"));
    }

    return forwardControllerError(err, next, "createProduct", "Помилка при створенні");
  }
};

export const updateProduct = async (req, res, next) => {
  try {
    ensureObjectId(req.params.id);

    const product = await Product.findById(req.params.id);
    if (!product) throw createHttpError(404, "Не знайдено");

    const updateData = await resolveProductSpecificationReferences(
      buildProductMutationPayload({
        body: req.body,
        existingProduct: product.toObject(),
        partial: true,
        allowInventoryFields: false,
      }),
      { sourceBody: req.body }
    );

    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    const hydrated = await attachReferenceDictionariesToProducts(
      await attachColorReferencesToProducts(updated.toObject())
    );
    res.json(normalizeProductCatalogPayload(hydrated));
  } catch (err) {
    if (err?.code === 11000) {
      return next(createHttpError(409, "Product slug must be unique"));
    }

    return forwardControllerError(err, next, "updateProduct", "Помилка оновлення");
  }
};

export const deleteProduct = async (req, res, next) => {
  try {
    ensureObjectId(req.params.id);

    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) throw createHttpError(404, "Не знайдено");

    res.json({ message: "Видалено" });
  } catch (err) {
    forwardControllerError(err, next, "deleteProduct", "Помилка видалення");
  }
};
