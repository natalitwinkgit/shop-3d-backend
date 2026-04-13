import multer from "multer";
import { Router } from "express";

import {
  buildProductInventoryView,
  upsertInventoryRow,
} from "../../controllers/inventoryController.js";
import { getProductsStats } from "../../controllers/productController.js";
import Product from "../../models/Product.js";
import { normalizeProductCatalogPayload } from "../../services/catalogNormalizationService.js";
import { attachColorReferencesToProducts } from "../../services/productColorReferenceService.js";
import {
  attachReferenceDictionariesToProducts,
  resolveProductSpecificationReferences,
} from "../../services/productReferenceService.js";
import {
  buildProductMutationPayload,
  createHttpError,
} from "../../services/productPayloadService.js";

const router = Router();
const textOnlyMultipart = multer().none();
const dimensionKeys = ["widthCm", "depthCm", "heightCm", "lengthCm", "diameterCm"];
const inventoryCollectionKeys = ["inventoryRows", "inventoryByLocations", "inventory", "inventories"];
const inventoryLocationKeys = [
  "locationId",
  "location",
  "inventoryLocationId",
  "storageLocationId",
  "storageLocation",
];

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const tryParseJson = (value) => {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed || !["{", "["].includes(trimmed[0])) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const pickTrimmedString = (...values) => {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }

  return "";
};

const extractLocationId = (row = {}) => {
  const directLocation = inventoryLocationKeys
    .map((key) => row?.[key])
    .find((value) => value !== undefined && value !== null && String(value).trim() !== "");

  if (isPlainObject(directLocation)) {
    return pickTrimmedString(
      directLocation._id,
      directLocation.id,
      directLocation.locationId,
      directLocation.value
    );
  }

  return pickTrimmedString(directLocation);
};

const normalizeInventoryRowInput = (row = {}, index = 0) => {
  const parsedRow = tryParseJson(row);
  if (!isPlainObject(parsedRow)) {
    throw createHttpError(400, `inventoryRows[${index}] must be an object`);
  }

  const locationId = extractLocationId(parsedRow);
  const hasRowPayload =
    inventoryLocationKeys.some((key) => hasOwn(parsedRow, key)) ||
    ["onHand", "quantity", "qty", "locationQty", "reserved", "reservedQty", "zone", "note"].some(
      (key) => hasOwn(parsedRow, key)
    );

  if (!hasRowPayload) return null;
  if (!locationId) {
    throw createHttpError(400, `inventoryRows[${index}].locationId is required`);
  }

  return {
    locationId,
    onHand:
      parsedRow.onHand ??
      parsedRow.quantity ??
      parsedRow.qty ??
      parsedRow.locationQty ??
      parsedRow.stockQty,
    reserved: parsedRow.reserved ?? parsedRow.reservedQty,
    zone: parsedRow.zone ?? parsedRow.storageZone,
    note: parsedRow.note,
    isShowcase: parsedRow.isShowcase ?? parsedRow.showcase,
    reason: parsedRow.reason,
  };
};

const parseInventoryRowsFromBody = (body = {}) => {
  const collectionKey = inventoryCollectionKeys.find((key) => hasOwn(body, key));
  let sourceRows = null;

  if (collectionKey) {
    const rawValue = body[collectionKey];
    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
      return [];
    }

    const parsed = tryParseJson(rawValue);

    if (Array.isArray(parsed)) {
      sourceRows = parsed;
    } else if (isPlainObject(parsed) && Array.isArray(parsed.items)) {
      sourceRows = parsed.items;
    } else if (isPlainObject(parsed) && Array.isArray(parsed.rows)) {
      sourceRows = parsed.rows;
    } else if (isPlainObject(parsed)) {
      sourceRows = [parsed];
    } else {
      throw createHttpError(400, `${collectionKey} must be an array of objects`);
    }
  } else if (
    inventoryLocationKeys.some((key) => String(body?.[key] || "").trim() !== "") ||
    ["onHand", "quantity", "qty", "locationQty", "reserved", "reservedQty", "zone", "note"].some(
      (key) => hasOwn(body, key)
    )
  ) {
    sourceRows = [body];
  } else {
    return [];
  }

  return sourceRows
    .map((row, index) => normalizeInventoryRowInput(row, index))
    .filter(Boolean);
};

const buildActorContext = (req) => ({
  actorId: String(req.user?._id || req.user?.id || ""),
  actorName: req.user?.name || req.user?.email || "Admin",
});

const syncInventoryRowsForProduct = async ({ productId, body, req }) => {
  const inventoryRows = parseInventoryRowsFromBody(body);
  if (!inventoryRows.length) return null;

  for (const row of inventoryRows) {
    await upsertInventoryRow({
      productId,
      locationId: row.locationId,
      body: row,
      actor: buildActorContext(req),
    });
  }

  return buildProductInventoryView({
    productId,
    req,
    extendedView: true,
  });
};

const mergeInventoryIntoProductPayload = (productPayload, inventoryView) => {
  if (!inventoryView) return productPayload;

  return {
    ...productPayload,
    inventoryRows: inventoryView.items,
    inventorySummary: inventoryView.summary,
  };
};

router.get("/products", async (_req, res, next) => {
  try {
    const items = await Product.find({}).sort({ createdAt: -1 }).lean();
    const hydrated = await attachReferenceDictionariesToProducts(
      await attachColorReferencesToProducts(items)
    );
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

    const hydrated = await attachReferenceDictionariesToProducts(
      await attachColorReferencesToProducts(product)
    );
    res.json(normalizeProductCatalogPayload(hydrated));
  } catch (error) {
    if (error?.name === "CastError") {
      return next(createHttpError(400, "Product not found"));
    }

    return next(error);
  }
});

router.post("/products", textOnlyMultipart, async (req, res, next) => {
  let doc = null;

  try {
    const payload = await resolveProductSpecificationReferences(
      buildProductMutationPayload({
        body: req.body,
        partial: false,
        allowInventoryFields: true,
      }),
      { sourceBody: req.body }
    );

    doc = await Product.create(payload);
    const inventoryView = await syncInventoryRowsForProduct({
      productId: String(doc._id),
      body: req.body,
      req,
    });
    const hydrated = await attachReferenceDictionariesToProducts(
      await attachColorReferencesToProducts(doc.toObject())
    );
    res
      .status(201)
      .json(mergeInventoryIntoProductPayload(normalizeProductCatalogPayload(hydrated), inventoryView));
  } catch (error) {
    if (doc?._id) {
      await Product.findByIdAndDelete(doc._id).catch(() => null);
    }

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

    const payload = await resolveProductSpecificationReferences(
      buildProductMutationPayload({
        body: req.body,
        existingProduct: product.toObject(),
        partial: true,
        allowInventoryFields: true,
      }),
      { sourceBody: req.body }
    );

    const saved = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true, runValidators: true }
    );
    const inventoryView = await syncInventoryRowsForProduct({
      productId: String(saved._id),
      body: req.body,
      req,
    });

    const hydrated = await attachReferenceDictionariesToProducts(
      await attachColorReferencesToProducts(saved.toObject())
    );
    res.json(
      mergeInventoryIntoProductPayload(normalizeProductCatalogPayload(hydrated), inventoryView)
    );
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

const buildDimensionPayload = (body = {}) => {
  const payload = {};
  const dimensions = tryParseJson(body.dimensions);

  if (dimensions && typeof dimensions === "object" && !Array.isArray(dimensions)) {
    dimensionKeys.forEach((key) => {
      if (hasOwn(dimensions, key)) {
        payload[key] = dimensions[key];
      }
    });
  }

  dimensionKeys.forEach((key) => {
    if (hasOwn(body, key)) {
      payload[key] = body[key];
    }
  });

  return Object.keys(payload).length ? { dimensions: payload } : {};
};

const buildIpRatingPayload = (body = {}) => {
  const specifications = tryParseJson(body.specifications);
  const ipRating = body.ipRating ?? specifications?.ipRating;
  if (ipRating === undefined) return {};
  return { specifications: { ipRating } };
};

const buildDimensionsUnset = () =>
  dimensionKeys.reduce((acc, key) => ({ ...acc, [`specifications.${key}`]: "" }), {});

const buildCharacteristicsUnset = () => ({
  ...buildDimensionsUnset(),
  "specifications.ipRating": "",
});

const buildCharacteristicsBody = (body = {}) => {
  const payload = {};

  if (hasOwn(body, "dimensions")) payload.dimensions = body.dimensions;
  if (hasOwn(body, "specifications")) payload.specifications = body.specifications;
  if (hasOwn(body, "ipRating")) payload.ipRating = body.ipRating;

  dimensionKeys.forEach((key) => {
    if (hasOwn(body, key)) payload[key] = body[key];
  });

  return payload;
};

router.get("/products/:id/dimensions", async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) throw createHttpError(404, "Product not found");

    res.json({ dimensions: normalizeProductCatalogPayload(product).dimensions });
  } catch (error) {
    if (error?.name === "CastError") {
      return next(createHttpError(400, "Product not found"));
    }

    return next(error);
  }
});

router.patch("/products/:id/dimensions", textOnlyMultipart, async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) throw createHttpError(404, "Product not found");

    const dimensionBody = buildDimensionPayload(req.body);
    const payload = await resolveProductSpecificationReferences(
      buildProductMutationPayload({
        body: dimensionBody,
        existingProduct: product.toObject(),
        partial: true,
        allowInventoryFields: true,
      }),
      { sourceBody: dimensionBody }
    );

    if (!payload.dimensions || !Object.keys(payload.dimensions).length) {
      throw createHttpError(400, "No dimensions provided");
    }

    const saved = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true, runValidators: true }
    );

    const hydrated = await attachReferenceDictionariesToProducts(
      await attachColorReferencesToProducts(saved.toObject())
    );
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
});

router.delete("/products/:id/dimensions", async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) throw createHttpError(404, "Product not found");

    const saved = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: { dimensions: {} }, $unset: buildDimensionsUnset() },
      { new: true, runValidators: true }
    );

    const hydrated = await attachReferenceDictionariesToProducts(
      await attachColorReferencesToProducts(saved.toObject())
    );
    res.json(normalizeProductCatalogPayload(hydrated));
  } catch (error) {
    if (error?.name === "CastError") {
      return next(createHttpError(400, "Product not found"));
    }

    return next(error);
  }
});

router.get("/products/:id/ip-rating", async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) throw createHttpError(404, "Product not found");

    res.json({ ipRating: product.specifications?.ipRating ?? null });
  } catch (error) {
    if (error?.name === "CastError") {
      return next(createHttpError(400, "Product not found"));
    }

    return next(error);
  }
});

router.patch("/products/:id/ip-rating", textOnlyMultipart, async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) throw createHttpError(404, "Product not found");

    const ipRatingBody = buildIpRatingPayload(req.body);
    const payload = await resolveProductSpecificationReferences(
      buildProductMutationPayload({
        body: ipRatingBody,
        existingProduct: product.toObject(),
        partial: true,
        allowInventoryFields: true,
      }),
      { sourceBody: ipRatingBody }
    );

    if (!payload.specifications || !hasOwn(payload.specifications, "ipRating")) {
      throw createHttpError(400, "ipRating is required");
    }

    const saved = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true, runValidators: true }
    );

    const hydrated = await attachReferenceDictionariesToProducts(
      await attachColorReferencesToProducts(saved.toObject())
    );
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
});

router.delete("/products/:id/ip-rating", async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) throw createHttpError(404, "Product not found");

    const saved = await Product.findByIdAndUpdate(
      req.params.id,
      { $unset: { "specifications.ipRating": "" } },
      { new: true, runValidators: true }
    );

    const hydrated = await attachReferenceDictionariesToProducts(
      await attachColorReferencesToProducts(saved.toObject())
    );
    res.json(normalizeProductCatalogPayload(hydrated));
  } catch (error) {
    if (error?.name === "CastError") {
      return next(createHttpError(400, "Product not found"));
    }

    return next(error);
  }
});

router.get("/products/:id/characteristics", async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) throw createHttpError(404, "Product not found");

    const hydrated = await attachReferenceDictionariesToProducts(product);
    const normalized = normalizeProductCatalogPayload(hydrated);
    res.json({
      dimensions: normalized.dimensions,
      specifications: normalized.specifications || {},
      ipRating: normalized.specifications?.ipRating ?? null,
    });
  } catch (error) {
    if (error?.name === "CastError") {
      return next(createHttpError(400, "Product not found"));
    }

    return next(error);
  }
});

router.patch("/products/:id/characteristics", textOnlyMultipart, async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) throw createHttpError(404, "Product not found");

    const characteristicsBody = buildCharacteristicsBody(req.body);
    const payload = await resolveProductSpecificationReferences(
      buildProductMutationPayload({
        body: characteristicsBody,
        existingProduct: product.toObject(),
        partial: true,
        allowInventoryFields: true,
      }),
      { sourceBody: characteristicsBody }
    );

    if (!payload.dimensions && !payload.specifications) {
      throw createHttpError(400, "No characteristics provided");
    }

    const saved = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true, runValidators: true }
    );

    const hydrated = await attachReferenceDictionariesToProducts(
      await attachColorReferencesToProducts(saved.toObject())
    );
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
});

router.delete("/products/:id/characteristics", async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) throw createHttpError(404, "Product not found");

    const saved = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: { dimensions: {} }, $unset: buildCharacteristicsUnset() },
      { new: true, runValidators: true }
    );

    const hydrated = await attachReferenceDictionariesToProducts(
      await attachColorReferencesToProducts(saved.toObject())
    );
    res.json(normalizeProductCatalogPayload(hydrated));
  } catch (error) {
    if (error?.name === "CastError") {
      return next(createHttpError(400, "Product not found"));
    }

    return next(error);
  }
});

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
