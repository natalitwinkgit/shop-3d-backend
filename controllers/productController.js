// controllers/productController.js
import Product from "../models/Product.js";
import Inventory from "../models/Inventory.js";
import path from "path";
import fs from "fs";
import {
  expandRoomQueryKeys,
  normalizeMaterialKeys,
  normalizeProductCatalogPayload,
  normalizeRoomKeys,
} from "../services/catalogNormalizationService.js";

/* =========================
    FS helpers
========================= */
const normalizePublicPath = (p) => String(p || "").replace(/^\/+/, "");
const isHttp = (p) => /^https?:\/\//i.test(String(p || ""));

const deleteFile = (filePath) => {
  try {
    if (!filePath || isHttp(filePath)) return;
    const rel = normalizePublicPath(filePath);
    if (!rel) return;

    const absolutePath = path.join(process.cwd(), "public", rel);
    if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
  } catch (err) {
    console.error("Failed to delete file:", filePath, err);
  }
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
export const getProductFacets = async (req, res) => {
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
    console.error("[getProductFacets] error:", e);
    res.status(500).json({ message: "Internal server error" });
  }
};

/* =======================
    ✅ GET /api/products
    inventory-first:
      - returns hasStock + availableTotal
      - supports query hasStock=1/0
      - reads inventories.product (NOT productId)
======================= */
export const getProducts = async (req, res) => {
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

    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json(list.map((item) => normalizeProductCatalogPayload(item)));
  } catch (err) {
    console.error("Products load error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getProductRooms = async (_req, res) => {
  try {
    const items = await Product.aggregate([
      { $match: { status: { $ne: "archived" } } },
      { $unwind: "$roomKeys" },
      {
        $group: {
          _id: "$roomKeys",
          count: { $sum: 1 },
          coverImage: { $first: { $arrayElemAt: ["$images", 0] } },
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
    console.error("[getProductRooms] error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/* =======================
    ✅ GET /api/products/stats
    inventory-first stats:
      - group by inventories.product (NOT productId)
======================= */
export const getProductsStats = async (req, res) => {
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
    res.status(500).json({ message: "Статистика недоступна" });
  }
};

/* =======================
    CRUD (як було)
======================= */
export const getProductBySlug = async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug });
    if (!product) return res.status(404).json({ message: "Товар не знайдено" });
    res.json(normalizeProductCatalogPayload(product.toObject()));
  } catch (err) {
    res.status(500).json({ message: "Помилка сервера" });
  }
};

export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Товар не знайдено" });
    res.json(normalizeProductCatalogPayload(product.toObject()));
  } catch (err) {
    res.status(500).json({ message: "Помилка сервера" });
  }
};

export const createProduct = async (req, res) => {
  try {
    const { name_ua, name_en, category, price } = req.body;
    if (!name_ua || !name_en || !category || isEmpty(price)) {
      return res.status(400).json({ message: "Заповніть обов'язкові поля" });
    }

    const images = req.files?.images?.map((f) => `/uploads/products/${category}/${f.filename}`) || [];
    const modelUrl = req.files?.modelFile?.[0]
      ? `/uploads/products/${category}/${req.files.modelFile[0].filename}`
      : req.body.modelUrl || "";

    const product = new Product({
      ...req.body,
      name: { ua: name_ua, en: name_en },
      price: Number(price),
      images,
      modelUrl,
      styleKeys: parseCsv(req.body.styleKeys) || [],
      colorKeys: parseCsv(req.body.colorKeys) || [],
      roomKeys: normalizeRoomKeys(parseCsv(req.body.roomKeys) || []),
      collectionKeys: parseCsv(req.body.collectionKeys) || [],
    });

    await product.save();
    res.status(201).json(normalizeProductCatalogPayload(product.toObject()));
  } catch (err) {
    console.error("[createProduct] error:", err);
    res.status(500).json({ message: "Помилка при створенні" });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Не знайдено" });

    const updateData = { ...req.body };

    // ❌ не зберігаємо
    delete updateData.inStock;
    delete updateData.stockQty;

    ["styleKeys", "colorKeys", "roomKeys", "collectionKeys"].forEach((key) => {
      if (req.body[key] !== undefined) {
        const parsed = parseCsv(req.body[key]) || [];
        updateData[key] = key === "roomKeys" ? normalizeRoomKeys(parsed) : parsed;
      }
    });

    const category = String(req.body.category || product.category || "uncategorized");

    if (req.files?.images?.length) {
      (product.images || []).forEach(deleteFile);
      updateData.images = req.files.images.map((f) => `/uploads/products/${category}/${f.filename}`);
    }

    if (req.files?.modelFile?.[0]) {
      if (product.modelUrl) deleteFile(product.modelUrl);
      updateData.modelUrl = `/uploads/products/${category}/${req.files.modelFile[0].filename}`;
    }

    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    );

    res.json(normalizeProductCatalogPayload(updated.toObject()));
  } catch (err) {
    console.error("[updateProduct] error:", err);
    res.status(500).json({ message: "Помилка оновлення" });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Не знайдено" });
    (deleted.images || []).forEach(deleteFile);
    if (deleted.modelUrl) deleteFile(deleted.modelUrl);
    res.json({ message: "Видалено" });
  } catch (err) {
    console.error("[deleteProduct] error:", err);
    res.status(500).json({ message: "Помилка видалення" });
  }
};
