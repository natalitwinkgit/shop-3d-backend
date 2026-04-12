import multer from "multer";
import { Router } from "express";

import { getProductsStats } from "../../controllers/productController.js";
import Product from "../../models/Product.js";
import { normalizeProductCatalogPayload } from "../../services/catalogNormalizationService.js";
import { attachColorReferencesToProducts } from "../../services/productColorReferenceService.js";
import {
  buildProductMutationPayload,
  createHttpError,
} from "../../services/productPayloadService.js";

const router = Router();
const textOnlyMultipart = multer().none();

router.get("/products", async (_req, res, next) => {
  try {
    const items = await Product.find({}).sort({ createdAt: -1 }).lean();
    const hydrated = await attachColorReferencesToProducts(items);
    res.json(hydrated.map((item) => normalizeProductCatalogPayload(item)));
  } catch (error) {
    next(error);
  }
});

router.get("/products/stats", getProductsStats);

router.get("/products/:id", async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) throw createHttpError(404, "Product not found");

    const hydrated = await attachColorReferencesToProducts(product);
    res.json(normalizeProductCatalogPayload(hydrated));
  } catch (error) {
    if (error?.name === "CastError") {
      return next(createHttpError(400, "Product not found"));
    }

    return next(error);
  }
});

router.post("/products", textOnlyMultipart, async (req, res, next) => {
  try {
    const payload = buildProductMutationPayload({
      body: req.body,
      partial: false,
      allowInventoryFields: true,
    });

    const doc = await Product.create(payload);
    const hydrated = await attachColorReferencesToProducts(doc.toObject());
    res.status(201).json(normalizeProductCatalogPayload(hydrated));
  } catch (error) {
    if (error?.code === 11000) {
      return next(createHttpError(409, "Product slug must be unique"));
    }

    return next(error);
  }
});

const updateAdminProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) throw createHttpError(404, "Product not found");

    const payload = buildProductMutationPayload({
      body: req.body,
      existingProduct: product.toObject(),
      partial: true,
      allowInventoryFields: true,
    });

    const saved = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true, runValidators: true }
    );

    const hydrated = await attachColorReferencesToProducts(saved.toObject());
    res.json(normalizeProductCatalogPayload(hydrated));
  } catch (error) {
    if (error?.name === "CastError") {
      return next(createHttpError(400, "Product not found"));
    }

    if (error?.code === 11000) {
      return next(createHttpError(409, "Product slug must be unique"));
    }

    return next(error);
  }
};

router.put("/products/:id", textOnlyMultipart, updateAdminProduct);
router.patch("/products/:id", textOnlyMultipart, updateAdminProduct);

router.delete("/products/:id", async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) throw createHttpError(404, "Product not found");

    await product.deleteOne();
    res.json({ ok: true });
  } catch (error) {
    if (error?.name === "CastError") {
      return next(createHttpError(400, "Product not found"));
    }

    return next(error);
  }
});

export default router;
