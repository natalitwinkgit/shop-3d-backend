import express from "express";
import multer from "multer";

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
import { attachColorReferencesToProducts } from "../services/productColorReferenceService.js";
import { attachReferenceDictionariesToProducts } from "../services/productReferenceService.js";

import { protect, admin } from "../middleware/authMiddleware.js";

const router = express.Router();
const textOnlyMultipart = multer().none();

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
    }).lean();
    if (!product) return res.status(404).json({ message: "Product not found" });
    const hydrated = await attachReferenceDictionariesToProducts(
      await attachColorReferencesToProducts(product)
    );
    res.json(normalizeProductCatalogPayload(hydrated));
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
  textOnlyMultipart,
  createProduct
);

// 7) PUT /api/products/:id — Оновлення
router.put(
  "/:id",
  protect,
  admin,
  textOnlyMultipart,
  updateProduct
);

router.patch(
  "/:id",
  protect,
  admin,
  textOnlyMultipart,
  updateProduct
);

// 8) DELETE /api/products/:id — Видалення
router.delete("/:id", protect, admin, deleteProduct);

export default router;
