import Inventory from "../models/Inventory.js";
import InventoryMovement from "../models/InventoryMovement.js";
import Location from "../models/Location.js";
import Product from "../models/Product.js";

const toNum = (x, def = 0) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
};

const clamp0 = (n) => Math.max(0, toNum(n, 0));

const pickStr = (value) => String(value || "").trim();

const toBool = (value) => String(value) === "true" || String(value) === "1" || value === true;

const isObjectIdLike = (value) => /^[a-f0-9]{24}$/i.test(String(value || ""));

const getActorContext = (req) => ({
  actorId: String(req.user?._id || req.user?.id || ""),
  actorName: req.user?.name || req.user?.email || "Admin",
});

const formatInventoryRow = (doc) => {
  const onHand = clamp0(doc.onHand);
  const reserved = clamp0(doc.reserved);
  const available = Math.max(0, onHand - reserved);

  return {
    id: String(doc._id),
    productId: String(doc.product?._id || doc.product || ""),
    productName:
      doc.product?.name?.ua || doc.product?.name?.en || doc.product?.slug || "",
    productSlug: doc.product?.slug || "",
    productCategory: doc.product?.category || "",
    productStatus: doc.product?.status || "",
    locationId: String(doc.location?._id || doc.location || ""),
    locationType: doc.location?.type || "",
    city: doc.location?.city || "",
    locationNameKey: doc.location?.nameKey || "",
    addressKey: doc.location?.addressKey || "",
    isActive: doc.location?.isActive ?? true,
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

const formatMovement = (doc) => ({
  id: String(doc._id),
  type: doc.type || "",
  productId: String(doc.product?._id || doc.product || ""),
  productName: doc.product?.name?.ua || doc.product?.name?.en || doc.product?.slug || "",
  productSlug: doc.product?.slug || "",
  locationId: String(doc.location?._id || doc.location || ""),
  locationNameKey: doc.location?.nameKey || "",
  fromLocationId: String(doc.fromLocation?._id || doc.fromLocation || ""),
  fromLocationNameKey: doc.fromLocation?.nameKey || "",
  toLocationId: String(doc.toLocation?._id || doc.toLocation || ""),
  toLocationNameKey: doc.toLocation?.nameKey || "",
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
});

const normalizeInventoryPayload = (body = {}) => ({
  onHand: clamp0(body.onHand),
  reserved: clamp0(body.reserved),
  zone: pickStr(body.zone),
  note: pickStr(body.note),
  isShowcase: toBool(body.isShowcase),
  reason: pickStr(body.reason),
});

const ensureProductAndLocation = async ({ productId, locationId }) => {
  const [product, location] = await Promise.all([
    Product.findById(productId).select("_id name slug category status").lean(),
    Location.findById(locationId).select("_id type city nameKey addressKey isActive").lean(),
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

// GET /api/inventory/product/:productId
export async function getByProduct(req, res) {
  try {
    const { productId } = req.params;

    const items = await Inventory.find({ product: productId })
      .populate("product", "name slug category status")
      .populate("location", "type city nameKey addressKey isActive")
      .sort({ isShowcase: -1, updatedAt: -1 })
      .lean();

    return res.json(items.map(formatInventoryRow));
  } catch (e) {
    return res.status(500).json({ message: "Inventory load failed", error: String(e?.message || e) });
  }
}

// GET /api/admin/inventory/location/:locationId
export async function getByLocation(req, res) {
  try {
    const { locationId } = req.params;
    const items = await Inventory.find({ location: locationId })
      .populate("product", "name slug category status")
      .populate("location", "type city nameKey addressKey isActive")
      .sort({ isShowcase: -1, updatedAt: -1 })
      .lean();

    return res.json({
      items: items.map(formatInventoryRow),
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
      .populate("location", "type city nameKey addressKey isActive")
      .sort({ updatedAt: -1 })
      .lean();

    const items = rows
      .map(formatInventoryRow)
      .filter((item) => {
        if (!q) return true;

        return [
          item.productName,
          item.productSlug,
          item.productCategory,
          item.locationNameKey,
          item.city,
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

    if (!productId || !locationId) {
      return res.status(400).json({ message: "productId and locationId are required" });
    }

    await ensureProductAndLocation({ productId, locationId });

    const payload = normalizeInventoryPayload(req.body);
    if (payload.reserved > payload.onHand) {
      return res.status(400).json({ message: "reserved cannot be greater than onHand" });
    }

    const existing = await Inventory.findOne({ product: productId, location: locationId }).lean();

    const updateData = {
      onHand: payload.onHand,
      reserved: payload.reserved,
      zone: payload.zone,
      note: payload.note,
      isShowcase: payload.isShowcase,
    };

    const doc = await Inventory.findOneAndUpdate(
      { product: productId, location: locationId },
      { $set: updateData },
      { new: true, upsert: true }
    )
      .populate("product", "name slug category status")
      .populate("location", "type city nameKey addressKey isActive")
      .lean();

    await logInventoryMovement({
      type: "upsert",
      product: productId,
      location: locationId,
      deltaOnHand: payload.onHand - clamp0(existing?.onHand),
      deltaReserved: payload.reserved - clamp0(existing?.reserved),
      previousOnHand: clamp0(existing?.onHand),
      nextOnHand: payload.onHand,
      previousReserved: clamp0(existing?.reserved),
      nextReserved: payload.reserved,
      quantity: payload.onHand - clamp0(existing?.onHand),
      zone: payload.zone,
      note: payload.note,
      isShowcase: payload.isShowcase,
      ...getActorContext(req),
      reason: payload.reason,
    });

    return res.json(formatInventoryRow(doc));
  } catch (e) {
    if (String(e).includes("E11000")) {
      return res.status(409).json({ message: "Duplicate inventory row (product+location)" });
    }
    return res.status(e.statusCode || 500).json({ message: "Upsert failed", error: String(e?.message || e) });
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
        .populate("location", "type city nameKey addressKey isActive")
        .lean(),
      Inventory.findById(target._id)
        .populate("product", "name slug category status")
        .populate("location", "type city nameKey addressKey isActive")
        .lean(),
    ]);

    return res.json({
      ok: true,
      from: formatInventoryRow(sourceRow),
      to: formatInventoryRow(targetRow),
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
      .populate("location", "nameKey city type")
      .populate("fromLocation", "nameKey city type")
      .populate("toLocation", "nameKey city type")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      items: items.map(formatMovement),
      total: items.length,
    });
  } catch (e) {
    return res.status(500).json({ message: "Inventory movements failed", error: String(e?.message || e) });
  }
}
