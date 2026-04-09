import { Router } from "express";

import { getProductsStats } from "../../controllers/productController.js";
import Product from "../../models/Product.js";
import { adminUpload, toBool } from "../lib/adminShared.js";
import { normalizeRoomKeys } from "../../services/catalogNormalizationService.js";

const router = Router();

router.get("/products", async (_req, res) => {
  try {
    const items = await Product.find({}).sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: "Failed to load products" });
  }
});

router.get("/products/stats", getProductsStats);

router.get("/products/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (error) {
    res.status(400).json({ message: "Product not found" });
  }
});

router.post(
  "/products",
  adminUpload.fields([
    { name: "images", maxCount: 20 },
    { name: "modelFile", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const body = req.body || {};
      const name = JSON.parse(body.name || "{}");
      const description = JSON.parse(body.description || "{}");
      const styleKeys = JSON.parse(body.styleKeys || "[]");
      const colorKeys = JSON.parse(body.colorKeys || "[]");
      const roomKeys = normalizeRoomKeys(JSON.parse(body.roomKeys || "[]"));
      const collectionKeys = JSON.parse(body.collectionKeys || "[]");
      const featureKeys = JSON.parse(body.featureKeys || "[]");
      const specifications = JSON.parse(body.specifications || "{}");

      const imageFiles = req.files?.images || [];
      const modelFiles = req.files?.modelFile || [];
      const images = imageFiles.map((file) => `/uploads/products/${file.filename}`);
      const modelUrl = modelFiles[0] ? `/uploads/products/${modelFiles[0].filename}` : "";

      const doc = await Product.create({
        name,
        description,
        slug: String(body.slug || "").trim(),
        category: String(body.category || "").trim(),
        subCategory: String(body.subCategory || "").trim(),
        typeKey: String(body.typeKey || "").trim(),
        price: Number(body.price || 0),
        discount: Number(body.discount || 0),
        inStock: toBool(body.inStock),
        stockQty: Number(body.stockQty || 0),
        status: String(body.status || "active"),
        styleKeys,
        colorKeys,
        roomKeys,
        collectionKeys,
        featureKeys,
        specifications,
        images,
        modelUrl,
      });

      res.status(201).json(doc);
    } catch (error) {
      console.error("[ADMIN products POST]", error);
      res.status(400).json({ message: "Create product failed" });
    }
  }
);

router.put(
  "/products/:id",
  adminUpload.fields([
    { name: "images", maxCount: 20 },
    { name: "modelFile", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const body = req.body || {};
      const product = await Product.findById(req.params.id);
      if (!product) return res.status(404).json({ message: "Product not found" });

      const name = JSON.parse(body.name || "{}");
      const description = JSON.parse(body.description || "{}");
      const styleKeys = JSON.parse(body.styleKeys || "[]");
      const colorKeys = JSON.parse(body.colorKeys || "[]");
      const roomKeys = normalizeRoomKeys(JSON.parse(body.roomKeys || "[]"));
      const collectionKeys = JSON.parse(body.collectionKeys || "[]");
      const featureKeys = JSON.parse(body.featureKeys || "[]");
      const specifications = JSON.parse(body.specifications || "{}");

      let keepImages = [];
      try {
        keepImages = JSON.parse(body.keepImages || "[]");
      } catch {
        keepImages = [];
      }

      const newImageFiles = req.files?.images || [];
      const newImages = newImageFiles.map((file) => `/uploads/products/${file.filename}`);
      const modelFiles = req.files?.modelFile || [];
      const newModel = modelFiles[0] ? `/uploads/products/${modelFiles[0].filename}` : null;

      product.name = name;
      product.description = description;
      product.slug = String(body.slug || "").trim();
      product.category = String(body.category || "").trim();
      product.subCategory = String(body.subCategory || "").trim();
      product.typeKey = String(body.typeKey || "").trim();
      product.price = Number(body.price || 0);
      product.discount = Number(body.discount || 0);
      product.inStock = toBool(body.inStock);
      product.stockQty = Number(body.stockQty || 0);
      product.status = String(body.status || "active");
      product.styleKeys = styleKeys;
      product.colorKeys = colorKeys;
      product.roomKeys = roomKeys;
      product.collectionKeys = collectionKeys;
      product.featureKeys = featureKeys;
      product.specifications = specifications;
      product.images = [...(Array.isArray(keepImages) ? keepImages : []), ...newImages];

      if (newModel) product.modelUrl = newModel;

      const saved = await product.save();
      res.json(saved);
    } catch (error) {
      console.error("[ADMIN products PUT]", error);
      res.status(400).json({ message: "Update product failed" });
    }
  }
);

router.delete("/products/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    await product.deleteOne();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: "Delete product failed" });
  }
});

export default router;
