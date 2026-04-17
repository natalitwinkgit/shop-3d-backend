import Inventory from "../models/Inventory.js";
import InventoryMovement from "../models/InventoryMovement.js";
import Location from "../models/Location.js";
import mongoose from "mongoose";
import Product from "../models/Product.js";
import {
  buildLocationPresentation,
  loadLocationTranslations,
  resolveLocationLang,
} from "../services/locationPresentationService.js";

const toNum = (x, def = 0) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
};

const clamp0 = (n) => Math.max(0, toNum(n, 0));

const pickStr = (value) => String(value || "").trim();

const toBool = (value) => String(value) === "true" || String(value) === "1" || value === true;
const isDuplicateKeyError = (error) =>
  Number(error?.code) === 11000 || String(error?.message || error || "").includes("E11000");

const legacyInventoryIdFields = new Set(["productId", "locationId"]);
const getDuplicateKeyFields = (error) =>
  Array.from(
    new Set([
      ...Object.keys(error?.keyPattern || {}),
      ...Object.keys(error?.keyValue || {}),
    ])
  );

const dropLegacyInventoryIndexesIfNeeded = async (error) => {
  const duplicateFields = getDuplicateKeyFields(error);
  if (!duplicateFields.some((field) => legacyInventoryIdFields.has(field))) {
    return false;
  }

  try {
    const indexes = await Inventory.collection.indexes();
    const legacyIndexes = (indexes || []).filter((indexDef) => {
      const indexFields = Object.keys(indexDef?.key || {});
      return indexDef?.name !== "_id_" && indexFields.some((field) => legacyInventoryIdFields.has(field));
    });

    if (!legacyIndexes.length) return true;

    for (const indexDef of legacyIndexes) {
      if (!indexDef?.name) continue;
      // eslint-disable-next-line no-await-in-loop
      await Inventory.collection.dropIndex(indexDef.name);
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

const isObjectIdLike = (value) => /^[a-f0-9]{24}$/i.test(String(value || ""));
const assertObjectId = (value, fieldName) => {
  if (!mongoose.Types.ObjectId.isValid(String(value || ""))) {
    const error = new Error(`${fieldName} is invalid`);
    error.statusCode = 400;
    throw error;
  }
};

const LOCATION_SELECT =
  "_id type city cityKey name nameKey address addressKey phone workingHours coordinates isActive";
const PRODUCT_SELECT =
  "_id name slug category status dimensions specifications";

const getActorContext = (req) => ({
  actorId: String(req.user?._id || req.user?.id || ""),
  actorName: req.user?.name || req.user?.email || "Admin",
});

const presentLocation = (locationDoc, translations) =>
  buildLocationPresentation(locationDoc || {}, translations);

const presentProduct = (productDoc) => {
  if (!productDoc) return null;

  return {
    id: String(productDoc._id || ""),
    name: productDoc.name || { ua: "", en: "" },
    slug: pickStr(productDoc.slug),
    category: pickStr(productDoc.category),
    status: pickStr(productDoc.status),
    dimensions:
      productDoc.dimensions && typeof productDoc.dimensions === "object"
        ? productDoc.dimensions
        : {},
    specifications:
      productDoc.specifications && typeof productDoc.specifications === "object"
        ? productDoc.specifications
        : {},
  };
};

const matchesInventoryFilters = (item, req) => {
  const city = pickStr(req.query.city).toLowerCase();
  const cityKey = pickStr(req.query.cityKey).toLowerCase();
  const type = pickStr(req.query.type).toLowerCase();
  const locationId = pickStr(req.query.locationId);
  const showcase = req.query.showcase;

  if (city && pickStr(item.city).toLowerCase() !== city) return false;
  if (cityKey && pickStr(item.cityKey).toLowerCase() !== cityKey) return false;
  if (type && pickStr(item.locationType).toLowerCase() !== type) return false;
  if (locationId && String(item.locationId || "") !== locationId) return false;
  if (showcase !== undefined && !!item.isShowcase !== toBool(showcase)) return false;

  return true;
};

const buildInventoryFacets = (items = []) => {
  const cityMap = new Map();
  const typeMap = new Map();
  const locationMap = new Map();

  items.forEach((item) => {
    const location = item.locationDetails || (typeof item.location === "object" ? item.location : {});
    const cityKey = pickStr(item.cityKey) || pickStr(location.cityKey) || pickStr(location.city);
    const cityLabel = pickStr(item.cityLabel) || pickStr(location.cityLabel) || pickStr(location.city);
    const type = pickStr(item.locationType) || pickStr(location.type);
    const locationId = String(item.locationId || location.id || location._id || "");

    if (cityKey) {
      const existingCity =
        cityMap.get(cityKey) || {
          city: pickStr(item.city) || pickStr(location.city),
          cityKey,
          cityLabel,
          count: 0,
        };
      existingCity.count += 1;
      cityMap.set(cityKey, existingCity);
    }

    if (type) {
      const existingType = typeMap.get(type) || { type, count: 0 };
      existingType.count += 1;
      typeMap.set(type, existingType);
    }

    if (locationId) {
      locationMap.set(locationId, {
        id: locationId,
        city: pickStr(item.city) || pickStr(location.city),
        cityKey: pickStr(item.cityKey) || pickStr(location.cityKey),
        cityLabel: cityLabel,
        type,
        name: pickStr(item.locationName) || pickStr(location.name),
        address: pickStr(item.locationAddress) || pickStr(location.address),
        isActive: item.isActive ?? location.isActive ?? true,
      });
    }
  });

  return {
    cities: Array.from(cityMap.values()).sort((left, right) =>
      String(left.cityLabel).localeCompare(String(right.cityLabel), "uk")
    ),
    types: Array.from(typeMap.values()).sort((left, right) =>
      String(left.type).localeCompare(String(right.type), "uk")
    ),
    locations: Array.from(locationMap.values()).sort((left, right) =>
      `${left.cityLabel} ${left.type} ${left.name}`.localeCompare(
        `${right.cityLabel} ${right.type} ${right.name}`,
        "uk"
      )
    ),
  };
};

const buildInventorySummary = (items = []) =>
  items.reduce(
    (acc, item) => {
      acc.rows += 1;
      acc.onHand += item.onHand;
      acc.reserved += item.reserved;
      acc.available += item.available;
      if (item.isShowcase) acc.showcaseRows += 1;
      return acc;
    },
    { rows: 0, onHand: 0, reserved: 0, available: 0, showcaseRows: 0 }
  );

const formatInventoryRow = (doc, translations) => {
  const onHand = clamp0(doc.onHand);
  const reserved = clamp0(doc.reserved);
  const available = Math.max(0, onHand - reserved);
  const location = presentLocation(doc.location, translations);

  const locationLabel = String(
    location.name || location.typeLabel || location.cityLabel || location.type || ""
  ).trim();

  return {
    id: String(doc._id),
    productId: String(doc.product?._id || doc.product || ""),
    productName:
      doc.product?.name?.ua || doc.product?.name?.en || doc.product?.slug || "",
    productSlug: doc.product?.slug || "",
    productCategory: doc.product?.category || "",
    productStatus: doc.product?.status || "",
    locationId: location.id || String(doc.location?._id || doc.location || ""),
    locationType: location.type || "",
    city: location.city || "",
    cityKey: location.cityKey || "",
    cityLabel: location.cityLabel || location.city || "",
    locationName: location.name || "",
    locationNameKey: location.nameKey || "",
    locationAddress: location.address || "",
    addressKey: location.addressKey || "",
    isActive: location.isActive ?? true,
    location: locationLabel,
    locationDetails: location,
    onHand,
    reserved,
    available,
    zone: pickStr(doc.zone),
    note: pickStr(doc.note),
    isShowcase: !!doc.isShowcase,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
};

const formatMovement = (doc, translations) => {
  const location = presentLocation(doc.location, translations);
  const fromLocation = presentLocation(doc.fromLocation, translations);
  const toLocation = presentLocation(doc.toLocation, translations);

  const locationLabel = String(
    location.name || location.typeLabel || location.cityLabel || location.type || ""
  ).trim();
  const fromLocationLabel = String(
    fromLocation.name || fromLocation.typeLabel || fromLocation.cityLabel || fromLocation.type || ""
  ).trim();
  const toLocationLabel = String(
    toLocation.name || toLocation.typeLabel || toLocation.cityLabel || toLocation.type || ""
  ).trim();

  return {
    id: String(doc._id),
    type: doc.type || "",
    productId: String(doc.product?._id || doc.product || ""),
    productName: doc.product?.name?.ua || doc.product?.name?.en || doc.product?.slug || "",
    productSlug: doc.product?.slug || "",
    locationId: location.id || String(doc.location?._id || doc.location || ""),
    locationName: location.name || "",
    locationNameKey: location.nameKey || "",
    locationAddress: location.address || "",
    location: locationLabel,
    locationDetails: location,
    fromLocationId: fromLocation.id || String(doc.fromLocation?._id || doc.fromLocation || ""),
    fromLocationName: fromLocation.name || "",
    fromLocationNameKey: fromLocation.nameKey || "",
    fromLocationAddress: fromLocation.address || "",
    fromLocation: fromLocationLabel,
    fromLocationDetails: fromLocation,
    toLocationId: toLocation.id || String(doc.toLocation?._id || doc.toLocation || ""),
    toLocationName: toLocation.name || "",
    toLocationNameKey: toLocation.nameKey || "",
    toLocationAddress: toLocation.address || "",
    toLocation: toLocationLabel,
    toLocationDetails: toLocation,
    deltaOnHand: Number(doc.deltaOnHand || 0),
    deltaReserved: Number(doc.deltaReserved || 0),
    previousOnHand: Number(doc.previousOnHand || 0),
    nextOnHand: Number(doc.nextOnHand || 0),
    previousReserved: Number(doc.previousReserved || 0),
    nextReserved: Number(doc.nextReserved || 0),
    quantity: Number(doc.quantity || 0),
    zone: pickStr(doc.zone),
    note: pickStr(doc.note),
    isShowcase: !!doc.isShowcase,
    actorId: pickStr(doc.actorId),
    actorName: pickStr(doc.actorName),
    reason: pickStr(doc.reason),
    createdAt: doc.createdAt,
    meta: doc.meta || null,
  };
};

const loadInventoryTranslations = async (req) =>
  loadLocationTranslations(resolveLocationLang(req));

export const normalizeInventoryPayload = (body = {}) => ({
  onHand: clamp0(body.onHand ?? body.quantity ?? body.qty ?? body.locationQty),
  reserved: clamp0(body.reserved ?? body.reservedQty),
  zone: pickStr(body.zone ?? body.storageZone),
  note: pickStr(body.note),
  isShowcase: toBool(body.isShowcase ?? body.showcase),
  reason: pickStr(body.reason),
});

const inventoryRowMatches = (row = {}, updateData = {}) =>
  clamp0(row.onHand) === clamp0(updateData.onHand) &&
  clamp0(row.reserved) === clamp0(updateData.reserved) &&
  pickStr(row.zone) === pickStr(updateData.zone) &&
  pickStr(row.note) === pickStr(updateData.note) &&
  !!row.isShowcase === !!updateData.isShowcase;

const withInventoryPopulate = (query) =>
  query
    .populate("product", "name slug category status")
    .populate("location", LOCATION_SELECT);

const ensureProductAndLocation = async ({ productId, locationId }) => {
  assertObjectId(productId, "productId");
  assertObjectId(locationId, "locationId");

  const [product, location] = await Promise.all([
    Product.findById(productId).select("_id name slug category status").lean(),
    Location.findById(locationId).select(LOCATION_SELECT).lean(),
  ]);

  if (!product) {
    const err = new Error("Товар не знайдено");
    err.statusCode = 404;
    throw err;
  }

  if (!location) {
    const err = new Error("Локацію не знайдено");
    err.statusCode = 404;
    throw err;
  }

  return { product, location };
};

const logInventoryMovement = async (payload) => {
  await InventoryMovement.create(payload);
};

export const buildProductInventoryView = async ({
  productId,
  req,
  extendedView = false,
} = {}) => {
  assertObjectId(productId, "productId");

  const items = await Inventory.find({ product: productId })
    .populate("product", PRODUCT_SELECT)
    .populate("location", LOCATION_SELECT)
    .sort({ isShowcase: -1, updatedAt: -1 })
    .lean();

  const translations = await loadInventoryTranslations(req);
  const filteredItems = items.filter((item) => matchesInventoryFilters(item, req));
  const formattedItems = filteredItems.map((item) => formatInventoryRow(item, translations));

  if (!extendedView) {
    return formattedItems;
  }

  const fallbackProduct =
    items[0]?.product || (await Product.findById(productId).select(PRODUCT_SELECT).lean());
  const product = presentProduct(fallbackProduct);

  if (!product) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }

  return {
    product,
    filters: {
      city: pickStr(req?.query?.city),
      cityKey: pickStr(req?.query?.cityKey),
      type: pickStr(req?.query?.type),
      locationId: pickStr(req?.query?.locationId),
      showcase: req?.query?.showcase === undefined ? null : toBool(req.query.showcase),
    },
    facets: buildInventoryFacets(formattedItems),
    summary: buildInventorySummary(formattedItems),
    items: formattedItems,
  };
};

export const upsertInventoryRow = async ({
  productId,
  locationId,
  body = {},
  actor = null,
} = {}) => {
  if (!productId || !locationId) {
    const error = new Error("productId and locationId are required");
    error.statusCode = 400;
    throw error;
  }

  await ensureProductAndLocation({ productId, locationId });

  const payload = normalizeInventoryPayload(body);
  if (payload.reserved > payload.onHand) {
    const error = new Error("reserved cannot be greater than onHand");
    error.statusCode = 400;
    throw error;
  }

  const filter = { product: productId, location: locationId };
  const updateData = {
    onHand: payload.onHand,
    reserved: payload.reserved,
    zone: payload.zone,
    note: payload.note,
    isShowcase: payload.isShowcase,
  };

  let previous = await Inventory.findOne(filter).lean();
  let doc = null;

  try {
    doc = await withInventoryPopulate(
      Inventory.findOneAndUpdate(filter, { $set: updateData }, { new: true, upsert: true })
    ).lean();
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;

    let duplicateError = error;
    const recoveredFromLegacyIndex = await dropLegacyInventoryIndexesIfNeeded(error);
    if (recoveredFromLegacyIndex) {
      try {
        doc = await withInventoryPopulate(
          Inventory.findOneAndUpdate(filter, { $set: updateData }, { new: true, upsert: true })
        ).lean();
      } catch (retryError) {
        if (!isDuplicateKeyError(retryError)) throw retryError;
        duplicateError = retryError;
      }
    }

    if (!doc) {
      previous = await Inventory.findOne(filter).lean();
      if (!previous) throw duplicateError;

      if (inventoryRowMatches(previous, updateData)) {
        doc = await withInventoryPopulate(Inventory.findById(previous._id)).lean();
      } else {
        doc = await withInventoryPopulate(
          Inventory.findOneAndUpdate(filter, { $set: updateData }, { new: true, upsert: false })
        ).lean();
      }
    }
  }

  if (!doc) {
    const error = new Error("Inventory row was not saved");
    error.statusCode = 500;
    throw error;
  }

  const changed = !previous || !inventoryRowMatches(previous, updateData);
  if (changed && actor) {
    await logInventoryMovement({
      type: "upsert",
      product: productId,
      location: locationId,
      deltaOnHand: payload.onHand - clamp0(previous?.onHand),
      deltaReserved: payload.reserved - clamp0(previous?.reserved),
      previousOnHand: clamp0(previous?.onHand),
      nextOnHand: payload.onHand,
      previousReserved: clamp0(previous?.reserved),
      nextReserved: payload.reserved,
      quantity: payload.onHand - clamp0(previous?.onHand),
      zone: payload.zone,
      note: payload.note,
      isShowcase: payload.isShowcase,
      actorId: pickStr(actor?.actorId),
      actorName: pickStr(actor?.actorName) || "Admin",
      reason: payload.reason,
    });
  }

  return { doc, payload, previous, changed };
};

// GET /api/inventory/product/:productId
export async function getByProduct(req, res) {
  try {
    const { productId } = req.params;
    const extendedView = ["1", "true", "full"].includes(String(req.query.view || "").toLowerCase());
    return res.json(
      await buildProductInventoryView({ productId, req, extendedView })
    );
  } catch (e) {
    return res
      .status(e.statusCode || 500)
      .json({ message: "Inventory load failed", error: String(e?.message || e) });
  }
}

// GET /api/admin/inventory/location/:locationId
export async function getByLocation(req, res) {
  try {
    const { locationId } = req.params;
    assertObjectId(locationId, "locationId");
    const items = await Inventory.find({ location: locationId })
      .populate("product", "name slug category status")
      .populate("location", LOCATION_SELECT)
      .sort({ isShowcase: -1, updatedAt: -1 })
      .lean();
    const translations = await loadInventoryTranslations(req);

    return res.json({
      items: items.map((item) => formatInventoryRow(item, translations)),
      total: items.length,
    });
  } catch (e) {
    return res.status(500).json({ message: "Location inventory load failed", error: String(e?.message || e) });
  }
}

// GET /api/admin/inventory/overview
export async function getOverview(req, res) {
  try {
    const filter = {};
    const q = pickStr(req.query.q).toLowerCase();

    if (isObjectIdLike(req.query.productId)) {
      filter.product = req.query.productId;
    }

    if (isObjectIdLike(req.query.locationId)) {
      filter.location = req.query.locationId;
    }

    if (req.query.showcase === "true") {
      filter.isShowcase = true;
    }

    const rows = await Inventory.find(filter)
      .populate("product", "name slug category status")
      .populate("location", LOCATION_SELECT)
      .sort({ updatedAt: -1 })
      .lean();
    const translations = await loadInventoryTranslations(req);

    const items = rows
      .map((row) => formatInventoryRow(row, translations))
      .filter((item) => {
        if (!q) return true;

        return [
          item.productName,
          item.productSlug,
          item.productCategory,
          item.locationName,
          item.locationNameKey,
          item.locationAddress,
          item.city,
          item.cityLabel,
          item.zone,
          item.note,
        ]
          .map((value) => pickStr(value).toLowerCase())
          .some((value) => value.includes(q));
      });

    const summary = items.reduce(
      (acc, item) => {
        acc.onHand += item.onHand;
        acc.reserved += item.reserved;
        acc.available += item.available;
        if (item.isShowcase) acc.showcaseRows += 1;
        acc.locationIds.add(item.locationId);
        acc.productIds.add(item.productId);
        return acc;
      },
      {
        onHand: 0,
        reserved: 0,
        available: 0,
        showcaseRows: 0,
        locationIds: new Set(),
        productIds: new Set(),
      }
    );

    return res.json({
      items,
      summary: {
        rows: items.length,
        onHand: summary.onHand,
        reserved: summary.reserved,
        available: summary.available,
        showcaseRows: summary.showcaseRows,
        locations: summary.locationIds.size,
        products: summary.productIds.size,
      },
    });
  } catch (e) {
    return res.status(500).json({ message: "Inventory overview failed", error: String(e?.message || e) });
  }
}

// PATCH /api/inventory
export async function upsert(req, res) {
  try {
    const { productId, locationId } = req.body;
    assertObjectId(productId, "productId");
    assertObjectId(locationId, "locationId");
    const { doc } = await upsertInventoryRow({
      productId,
      locationId,
      body: req.body,
      actor: getActorContext(req),
    });

    const translations = await loadInventoryTranslations(req);
    return res.json(formatInventoryRow(doc, translations));
  } catch (e) {
    const statusCode = e?.statusCode || 500;
    const message =
      statusCode >= 500
        ? "Inventory upsert failed"
        : String(e?.message || "Inventory upsert failed");
    return res.status(statusCode).json({ message, error: String(e?.message || e) });
  }
}

// DELETE /api/inventory/:id
export async function remove(req, res) {
  try {
    const id = pickStr(req.params.id);
    if (!isObjectIdLike(id)) {
      return res.status(400).json({ message: "Invalid inventory id" });
    }

    const existing = await Inventory.findById(id)
      .populate("product", PRODUCT_SELECT)
      .populate("location", LOCATION_SELECT)
      .lean();

    if (!existing) {
      return res.status(404).json({ message: "Inventory row not found" });
    }

    await Inventory.findByIdAndDelete(id);

    await logInventoryMovement({
      type: "delete",
      product: existing.product?._id || existing.product,
      location: existing.location?._id || existing.location,
      deltaOnHand: -clamp0(existing.onHand),
      deltaReserved: -clamp0(existing.reserved),
      previousOnHand: clamp0(existing.onHand),
      nextOnHand: 0,
      previousReserved: clamp0(existing.reserved),
      nextReserved: 0,
      quantity: clamp0(existing.onHand),
      zone: pickStr(existing.zone),
      note: pickStr(existing.note),
      isShowcase: !!existing.isShowcase,
      ...getActorContext(req),
      reason: pickStr(req.body?.reason || req.query?.reason),
    });

    const translations = await loadInventoryTranslations(req);
    return res.json({
      ok: true,
      removed: formatInventoryRow(existing, translations),
    });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ message: "Delete failed", error: String(e?.message || e) });
  }
}

// POST /api/admin/inventory/transfer
export async function transfer(req, res) {
  try {
    const productId = pickStr(req.body.productId);
    const fromLocationId = pickStr(req.body.fromLocationId);
    const toLocationId = pickStr(req.body.toLocationId);
    const quantity = clamp0(req.body.quantity);
    const reason = pickStr(req.body.reason);
    const targetZone = pickStr(req.body.targetZone);
    const targetNote = pickStr(req.body.targetNote);
    const targetIsShowcase = toBool(req.body.targetIsShowcase);

    if (!productId || !fromLocationId || !toLocationId) {
      return res.status(400).json({ message: "productId, fromLocationId and toLocationId are required" });
    }

    if (fromLocationId === toLocationId) {
      return res.status(400).json({ message: "fromLocationId and toLocationId must be different" });
    }

    if (quantity <= 0) {
      return res.status(400).json({ message: "quantity must be greater than 0" });
    }

    await Promise.all([
      ensureProductAndLocation({ productId, locationId: fromLocationId }),
      ensureProductAndLocation({ productId, locationId: toLocationId }),
    ]);

    const source = await Inventory.findOne({ product: productId, location: fromLocationId });
    if (!source) {
      return res.status(404).json({ message: "Source inventory row not found" });
    }

    const sourceAvailable = clamp0(source.onHand) - clamp0(source.reserved);
    if (sourceAvailable < quantity) {
      return res.status(400).json({ message: "Not enough available stock for transfer" });
    }

    source.onHand = clamp0(source.onHand) - quantity;
    await source.save();

    let target = await Inventory.findOne({ product: productId, location: toLocationId });
    if (!target) {
      target = await Inventory.create({
        product: productId,
        location: toLocationId,
        onHand: 0,
        reserved: 0,
        zone: targetZone,
        note: targetNote,
        isShowcase: targetIsShowcase,
      });
    }

    target.onHand = clamp0(target.onHand) + quantity;
    if (targetZone) target.zone = targetZone;
    if (targetNote) target.note = targetNote;
    if ("targetIsShowcase" in req.body) target.isShowcase = targetIsShowcase;
    await target.save();

    await logInventoryMovement({
      type: "transfer",
      product: productId,
      fromLocation: fromLocationId,
      toLocation: toLocationId,
      deltaOnHand: quantity,
      deltaReserved: 0,
      previousOnHand: clamp0(source.onHand) + quantity,
      nextOnHand: clamp0(source.onHand),
      previousReserved: clamp0(source.reserved),
      nextReserved: clamp0(source.reserved),
      quantity,
      zone: target.zone || "",
      note: target.note || "",
      isShowcase: !!target.isShowcase,
      ...getActorContext(req),
      reason,
      meta: {
        fromOnHand: clamp0(source.onHand),
        toOnHand: clamp0(target.onHand),
      },
    });

    const [sourceRow, targetRow] = await Promise.all([
      Inventory.findById(source._id)
        .populate("product", "name slug category status")
        .populate("location", LOCATION_SELECT)
        .lean(),
      Inventory.findById(target._id)
        .populate("product", "name slug category status")
        .populate("location", LOCATION_SELECT)
        .lean(),
    ]);
    const translations = await loadInventoryTranslations(req);

    return res.json({
      ok: true,
      from: formatInventoryRow(sourceRow, translations),
      to: formatInventoryRow(targetRow, translations),
      transferredQty: quantity,
    });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ message: "Transfer failed", error: String(e?.message || e) });
  }
}

// GET /api/admin/inventory/movements
export async function getMovements(req, res) {
  try {
    const filter = {};

    if (isObjectIdLike(req.query.productId)) {
      filter.product = req.query.productId;
    }

    if (isObjectIdLike(req.query.locationId)) {
      filter.$or = [
        { location: req.query.locationId },
        { fromLocation: req.query.locationId },
        { toLocation: req.query.locationId },
      ];
    }

    if (req.query.type) {
      filter.type = pickStr(req.query.type);
    }

    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));

    const items = await InventoryMovement.find(filter)
      .populate("product", "name slug category")
      .populate("location", LOCATION_SELECT)
      .populate("fromLocation", LOCATION_SELECT)
      .populate("toLocation", LOCATION_SELECT)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    const translations = await loadInventoryTranslations(req);

    return res.json({
      items: items.map((item) => formatMovement(item, translations)),
      total: items.length,
    });
  } catch (e) {
    return res.status(500).json({ message: "Inventory movements failed", error: String(e?.message || e) });
  }
}
