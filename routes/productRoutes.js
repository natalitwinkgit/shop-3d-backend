import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

import Product from "../models/Product.js";
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductFacets,
  getProductRooms,
  getProductBySlug,    // ✅ НОВЕ: з контролера
  getProductsStats     // ✅ НОВЕ: з контролера
} from "../controllers/productController.js";
import { normalizeProductCatalogPayload } from "../services/catalogNormalizationService.js";

import { protect, admin } from "../middleware/authMiddleware.js";

const router = express.Router();

/* =========================
   MULTER STORAGE (ЗБЕРЕЖЕНО)
========================= */
const baseUploadPath = path.join(process.cwd(), "public/uploads/products");

const ensureCategoryFolder = (categoryKey) => {
  const safeKey = String(categoryKey || "uncategorized").trim() || "uncategorized";
  const folderPath = path.join(baseUploadPath, safeKey);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  return folderPath;
};

const attachCategoryFromProduct = async (req, res, next) => {
  try {
    if (req.body?.category) return next();
    if (!req.params?.id) return next();
    const product = await Product.findById(req.params.id).select("category");
    if (product?.category) req.body.category = String(product.category);
    return next();
  } catch (err) {
    return next();
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const category = req.body.category || "uncategorized";
    const folderPath = ensureCategoryFolder(category);
    cb(null, folderPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({ storage });

/* =========================
   ROUTES
========================= */

// 1) Статистика для адмін-панелі (Додано)
// Важливо: ставити перед /:id, щоб 'stats' не сприйнялося як ID
router.get("/stats", protect, admin, getProductsStats);

// 2) GET /api/products — список + query filter
router.get("/", getProducts);
router.get("/filter", getProducts);

// 3) GET /api/products/facets — ключі фільтрів
router.get("/facets", getProductFacets);
router.get("/rooms", getProductRooms);

/**
 * 4) SEO URL: /api/products/by-slug/...
 */
// Повна версія (категорія + підкатегорія + slug)
router.get("/by-slug/:category/:subCategory/:slug", async (req, res) => {
  try {
    const { category, subCategory, slug } = req.params;
    const product = await Product.findOne({
      slug: String(slug || "").trim(),
      category: String(category || "").trim(),
      subCategory: String(subCategory || "").trim(),
    });
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(normalizeProductCatalogPayload(product.toObject()));
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

// Глобальна версія по одному slug (Оновлено через контролер)
router.get("/by-slug/:slug", getProductBySlug);

// 5) GET /api/products/:id — по ID
router.get("/:id", getProductById);

// 6) POST /api/products — Створення
router.post(
  "/",
  protect,
  admin,
  upload.fields([
    { name: "images", maxCount: 5 },
    { name: "modelFile", maxCount: 1 },
  ]),
  createProduct
);

// 7) PUT /api/products/:id — Оновлення
router.put(
  "/:id",
  protect,
  admin,
  attachCategoryFromProduct,
  upload.fields([
    { name: "images", maxCount: 5 },
    { name: "modelFile", maxCount: 1 },
  ]),
  updateProduct
);

// 8) DELETE /api/products/:id — Видалення
router.delete("/:id", protect, admin, deleteProduct);

export default router;
