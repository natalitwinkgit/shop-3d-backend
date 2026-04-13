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
  attachProductAttributeReferencesToProducts,
  resolveProductAttributeKeys,
} from "../../services/productAttributeReferenceService.js";
import { attachProductInventoryAvailability } from "../../services/productInventoryAvailabilityService.js";
import {
  attachReferenceDictionariesToProducts,
  resolveProductSpecificationReferences,
} from "../../services/productReferenceService.js";
import {
  MAX_PRODUCT_IMAGE_COUNT,
  buildProductMutationPayload,
  createHttpError,
} from "../../services/productPayloadService.js";
import Location from "../../models/Location.js";
import {
  productMediaUploadFields,
  toUploadPublicPath,
} from "../../services/productMediaUploadService.js";

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
const imageListKeys = [
  "images",
  "images[]",
  "imageUrls",
  "imageUrls[]",
  "galleryUrls",
  "galleryUrls[]",
  "photoUrls",
  "photoUrls[]",
  "photos",
  "photos[]",
];
const numberedImageFieldPattern =
  /^(?:imageUrl|image|photoUrl|photo|galleryUrl|galleryImageUrl)(?:[_-]?)([1-9]\d*)$/i;

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const toBool = (value) => {
  if (typeof value === "boolean") return value;
  if (value == null) return false;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on", "all"].includes(normalized);
};

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

const parseStringArray = (value) => {
  if (value === undefined || value === null) return [];
  const parsed = tryParseJson(value);
  let items = [];

  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (typeof parsed === "string") {
    items = parsed.split(/[\r\n,;]+/);
  } else {
    return [];
  }

  return Array.from(
    new Set(
      items
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
};

const collectNumberedImageUrls = (body = {}) =>
  Object.keys(body || {})
    .map((field) => {
      const match = String(field).match(numberedImageFieldPattern);
      if (!match) return null;

      const index = Number(match[1]);
      if (index > MAX_PRODUCT_IMAGE_COUNT) {
        throw createHttpError(
          400,
          `numbered image URL fields support only 1-${MAX_PRODUCT_IMAGE_COUNT}`
        );
      }

      return { field, index };
    })
    .filter(Boolean)
    .sort((left, right) => left.index - right.index)
    .flatMap(({ field }) => parseStringArray(body[field]));

const assertProductImageCount = (items = []) => {
  if (items.length > MAX_PRODUCT_IMAGE_COUNT) {
    throw createHttpError(400, `images must contain at most ${MAX_PRODUCT_IMAGE_COUNT} items`);
  }
};

const collectUploadedFiles = (filesMap = {}, keys = []) =>
  keys.flatMap((key) => (Array.isArray(filesMap?.[key]) ? filesMap[key] : []));

const mergeProductMediaFromUploads = (req) => {
  const filesMap = req?.files || {};
  if (!filesMap || typeof filesMap !== "object") return;

  const uploadedPreview = collectUploadedFiles(filesMap, ["previewImageFile"])[0];
  const uploadedImages = collectUploadedFiles(filesMap, [
    "imageFiles",
    "images",
    "photos",
    "galleryFiles",
  ]).map((file) => toUploadPublicPath(file?.path || file?.filename));
  const uploadedModel = collectUploadedFiles(filesMap, ["modelFile", "model", "model3dFile", "glbFile"])[0];

  const bodyImages = [
    ...imageListKeys.flatMap((key) => parseStringArray(req.body?.[key])),
    ...collectNumberedImageUrls(req.body),
  ];

  const mergedImages = Array.from(new Set([...bodyImages, ...uploadedImages])).filter(Boolean);
  const explicitPreview = pickTrimmedString(
    req.body?.previewImage,
    req.body?.imageUrl,
    req.body?.coverImageUrl,
    req.body?.mainImageUrl
  );
  const previewFromUpload = toUploadPublicPath(uploadedPreview?.path || uploadedPreview?.filename);
  const resolvedPreview = previewFromUpload || explicitPreview || mergedImages[0] || "";
  const resolvedImages = Array.from(
    new Set([resolvedPreview, ...mergedImages].filter(Boolean))
  );

  assertProductImageCount(resolvedImages);

  if (resolvedPreview) {
    req.body.previewImage = resolvedPreview;
  }

  if (mergedImages.length) {
    req.body.images = resolvedImages;
  }

  const modelUrl = toUploadPublicPath(uploadedModel?.path || uploadedModel?.filename);
  if (modelUrl) {
    req.body.modelUrl = modelUrl;
  }
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

const parseInventoryRowsForAllLocations = async (body = {}) => {
  const shouldApplyForAll = toBool(
    body.applyInventoryToAllLocations ??
      body.inventoryForAllLocations ??
      body.inventoryApplyToAll ??
      body.inventoryAllLocations
  );

  if (!shouldApplyForAll) return [];

  const includeInactive = toBool(body.includeInactiveLocations ?? body.inventoryIncludeInactiveLocations);
  const onlyCityKey = pickTrimmedString(body.inventoryCityKey ?? body.cityKey);
  const onlyType = pickTrimmedString(body.inventoryLocationType ?? body.type);

  const allLocations = await Location.find(includeInactive ? {} : { isActive: { $ne: false } })
    .select("_id city cityKey type isActive")
    .lean();

  const filteredLocations = allLocations.filter((location) => {
    if (onlyCityKey && String(location.cityKey || location.city || "").trim() !== onlyCityKey) return false;
    if (onlyType && String(location.type || "").trim() !== onlyType) return false;
    return true;
  });

  if (!filteredLocations.length) {
    throw createHttpError(400, "No locations matched inventory-all-locations filter");
  }

  const template = normalizeInventoryRowInput(
    {
      locationId: "template",
      onHand:
        body.inventoryAllOnHand ??
        body.inventoryAllQty ??
        body.inventoryOnHand ??
        body.onHand ??
        body.quantity ??
        body.qty ??
        body.locationQty ??
        0,
      reserved: body.inventoryAllReserved ?? body.reserved ?? 0,
      zone: body.inventoryAllZone ?? body.zone ?? "",
      note: body.inventoryAllNote ?? body.note ?? "",
      isShowcase: body.inventoryAllShowcase ?? body.isShowcase ?? false,
      reason: body.inventoryAllReason ?? body.reason ?? "Admin stock sync (all locations)",
    },
    0
  );

  return filteredLocations.map((location) => ({
    ...template,
    locationId: String(location._id),
  }));
};

const buildActorContext = (req) => ({
  actorId: String(req.user?._id || req.user?.id || ""),
  actorName: req.user?.name || req.user?.email || "Admin",
});

const ensureUniqueProductSlug = async ({ baseSlug, excludeId = null }) => {
  const normalizedBase = String(baseSlug || "").trim();
  if (!normalizedBase) {
    throw createHttpError(400, "slug is required");
  }

  let candidate = normalizedBase;
  let counter = 2;

  // Guarded loop: should exit quickly in practice.
  while (counter < 5000) {
    const existing = await Product.findOne({
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    })
      .select("_id")
      .lean();

    if (!existing) return candidate;
    candidate = `${normalizedBase}-${counter}`;
    counter += 1;
  }

  throw createHttpError(409, "Unable to generate unique slug");
};

const ensureUniqueProductSku = async ({ baseSku, excludeId = null }) => {
  const normalizedBase = String(baseSku || "").trim();
  if (!normalizedBase) return "";

  let candidate = normalizedBase;
  let counter = 2;

  while (counter < 5000) {
    const existing = await Product.findOne({
      sku: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    })
      .select("_id")
      .lean();

    if (!existing) return candidate;
    candidate = `${normalizedBase}-${counter}`;
    counter += 1;
  }

  throw createHttpError(409, "Unable to generate unique sku");
};

const resolveUniqueProductIdentity = async ({ payload, excludeId = null }) => {
  const nextPayload = { ...(payload || {}) };
  nextPayload.slug = await ensureUniqueProductSlug({
    baseSlug: nextPayload.slug,
    excludeId,
  });
  if (nextPayload.sku) {
    nextPayload.sku = await ensureUniqueProductSku({
      baseSku: nextPayload.sku,
      excludeId,
    });
  }
  return nextPayload;
};

const describeDuplicateKeyError = (error) => {
  const duplicateField =
    Object.keys(error?.keyPattern || {})[0] ||
    Object.keys(error?.keyValue || {})[0] ||
    "";
  const duplicateValue =
    duplicateField && error?.keyValue ? error.keyValue[duplicateField] : undefined;

  if (duplicateField === "slug") {
    return "Product slug must be unique";
  }
  if (duplicateField === "sku") {
    return "Product SKU must be unique";
  }
  if (duplicateField) {
    return `Product ${duplicateField} must be unique`;
  }

  return duplicateValue !== undefined
    ? `Product unique field conflict: ${String(duplicateValue)}`
    : "Product unique field conflict";
};

const getDuplicateFieldName = (error) =>
  Object.keys(error?.keyPattern || {})[0] ||
  Object.keys(error?.keyValue || {})[0] ||
  "";

const dropLegacyProductIdIndexIfNeeded = async (error) => {
  const duplicateField = getDuplicateFieldName(error);
  if (duplicateField !== "productId") return false;

  try {
    const indexes = await Product.collection.indexes();
    const legacyProductIdIndexes = (indexes || []).filter((indexDef) => {
      const key = indexDef?.key || {};
      const hasProductIdKey = Object.prototype.hasOwnProperty.call(key, "productId");
      return Boolean(hasProductIdKey && indexDef?.unique);
    });

    if (!legacyProductIdIndexes.length) return true;

    for (const indexDef of legacyProductIdIndexes) {
      if (!indexDef?.name) continue;
      // eslint-disable-next-line no-await-in-loop
      await Product.collection.dropIndex(indexDef.name);
    }
    return true;
  } catch (dropError) {
    const message = String(dropError?.message || "");
    if (
      dropError?.codeName === "IndexNotFound" ||
      /index not found/i.test(message) ||
      /ns not found/i.test(message)
    ) {
      return true;
    }
    throw dropError;
  }
};

const syncInventoryRowsForProduct = async ({ productId, body, req }) => {
  const inventoryRows = parseInventoryRowsFromBody(body);
  const inventoryRowsForAllLocations = await parseInventoryRowsForAllLocations(body);
  const mergedInventoryRows = [...inventoryRowsForAllLocations, ...inventoryRows];
  const uniqueInventoryRows = Array.from(
    mergedInventoryRows.reduce((acc, row) => {
      acc.set(String(row.locationId), row);
      return acc;
    }, new Map()).values()
  );
  if (!uniqueInventoryRows.length) return null;

  for (const row of uniqueInventoryRows) {
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
    const hydrated = await attachProductAttributeReferencesToProducts(
      await attachReferenceDictionariesToProducts(
        await attachColorReferencesToProducts(items)
      )
    );
    const withInventory = await attachProductInventoryAvailability(hydrated, {
      req: _req,
      includeRows: true,
    });
    res.json(withInventory.map((item) => normalizeProductCatalogPayload(item)));
  } catch (error) {
    next(error);
  }
});

router.get("/products/stats", getProductsStats);

router.get("/products/:id", async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) throw createHttpError(404, "Product not found");

    const hydrated = await attachProductAttributeReferencesToProducts(
      await attachReferenceDictionariesToProducts(
        await attachColorReferencesToProducts(product)
      )
    );
    const withInventory = await attachProductInventoryAvailability(hydrated, {
      req,
      includeRows: true,
    });
    res.json(normalizeProductCatalogPayload(withInventory));
  } catch (error) {
    if (error?.name === "CastError") {
      return next(createHttpError(400, "Product not found"));
    }

    return next(error);
  }
});

router.post("/products", productMediaUploadFields, async (req, res, next) => {
  let doc = null;
  let payload = null;

  try {
    mergeProductMediaFromUploads(req);
    payload = await resolveProductAttributeKeys(
      await resolveProductSpecificationReferences(
        buildProductMutationPayload({
          body: req.body,
          partial: false,
          allowInventoryFields: true,
        }),
        { sourceBody: req.body }
      )
    );
    payload = await resolveUniqueProductIdentity({ payload });

    try {
      doc = await Product.create(payload);
    } catch (createError) {
      if (createError?.code !== 11000) throw createError;
      const recoveredFromLegacyIndex = await dropLegacyProductIdIndexIfNeeded(createError);
      if (recoveredFromLegacyIndex) {
        doc = await Product.create(payload);
      } else {
        payload = await resolveUniqueProductIdentity({ payload });
        doc = await Product.create(payload);
      }
    }
    const inventoryView = await syncInventoryRowsForProduct({
      productId: String(doc._id),
      body: req.body,
      req,
    });
    const hydrated = await attachProductAttributeReferencesToProducts(
      await attachReferenceDictionariesToProducts(
        await attachColorReferencesToProducts(doc.toObject())
      )
    );
    res
      .status(201)
      .json(mergeInventoryIntoProductPayload(normalizeProductCatalogPayload(hydrated), inventoryView));
  } catch (error) {
    if (doc?._id) {
      await Product.findByIdAndDelete(doc._id).catch(() => null);
    }

    if (error?.code === 11000) {
      return next(createHttpError(409, describeDuplicateKeyError(error)));
    }

    return next(error);
  }
});

const updateAdminProduct = async (req, res, next) => {
  try {
    mergeProductMediaFromUploads(req);
    const product = await Product.findById(req.params.id);
    if (!product) throw createHttpError(404, "Product not found");

    const payload = await resolveProductAttributeKeys(
      await resolveProductSpecificationReferences(
        buildProductMutationPayload({
          body: req.body,
          existingProduct: product.toObject(),
          partial: true,
          allowInventoryFields: true,
        }),
        { sourceBody: req.body }
      )
    );
    const payloadWithUniqueIdentity =
      payload.slug || payload.sku
        ? await resolveUniqueProductIdentity({
            payload,
            excludeId: String(product._id),
          })
        : payload;

    let saved = null;
    try {
      saved = await Product.findByIdAndUpdate(
        req.params.id,
        { $set: payloadWithUniqueIdentity },
        { new: true, runValidators: true }
      );
    } catch (updateError) {
      if (updateError?.code !== 11000 || (!payloadWithUniqueIdentity.slug && !payloadWithUniqueIdentity.sku)) {
        throw updateError;
      }
      const retriedPayload = await resolveUniqueProductIdentity({
        payload: payloadWithUniqueIdentity,
        excludeId: String(product._id),
      });
      saved = await Product.findByIdAndUpdate(
        req.params.id,
        { $set: retriedPayload },
        { new: true, runValidators: true }
      );
    }
    const inventoryView = await syncInventoryRowsForProduct({
      productId: String(saved._id),
      body: req.body,
      req,
    });

    const hydrated = await attachProductAttributeReferencesToProducts(
      await attachReferenceDictionariesToProducts(
        await attachColorReferencesToProducts(saved.toObject())
      )
    );
    res.json(
      mergeInventoryIntoProductPayload(normalizeProductCatalogPayload(hydrated), inventoryView)
    );
  } catch (error) {
    if (error?.name === "CastError") {
      return next(createHttpError(400, "Product not found"));
    }

    if (error?.code === 11000) {
      return next(createHttpError(409, describeDuplicateKeyError(error)));
    }

    return next(error);
  }
};

router.put("/products/:id", productMediaUploadFields, updateAdminProduct);
router.patch("/products/:id", productMediaUploadFields, updateAdminProduct);

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
