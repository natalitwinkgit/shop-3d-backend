// server/controllers/orderController.js
import mongoose from "mongoose";
import Order, { ORDER_STATUSES } from "../models/Order.js";
import User from "../models/userModel.js";
import Product from "../models/Product.js";
import Location from "../models/Location.js";
import {
  buildCheckoutDiscountSummary,
  markRewardUsedByOrder,
  restoreRewardFromOrder,
  syncUserCommerceData,
} from "../services/userProfileService.js";
import {
  buildLocationPresentation,
  loadLocationTranslations,
  resolveLocationLang,
} from "../services/locationPresentationService.js";
import { syncOrderLoyaltyEffects } from "../services/loyaltyService.js";

const isObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v || ""));

const normalizePhone = (s) => String(s || "").replace(/[^\d+]/g, "").trim();

const toNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const pickStr = (v) => String(v ?? "").trim();

const roundMoney = (value) => Math.max(0, Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100);
const PICKUP_LOCATION_SELECT =
  "_id type city cityKey name nameKey address addressKey phone workingHours coordinates isActive";
const ORDER_STATUS_SET = new Set(ORDER_STATUSES);
const ORDER_ADMIN_POPULATE = [
  { path: "user", select: "name email role status phone" },
  { path: "delivery.pickupLocationId", select: PICKUP_LOCATION_SELECT },
  { path: "assignedTo", select: "name email role" },
  { path: "deletedBy", select: "name email role" },
  { path: "statusHistory.changedBy", select: "name email role" },
];

const computeProductUnitPrice = (productDoc) => {
  const price = Math.max(0, toNumber(productDoc?.price, 0));
  const discountPct = Math.max(
    0,
    Math.min(100, toNumber(productDoc?.discount ?? productDoc?.discountPct ?? 0, 0))
  );

  return roundMoney(price * (1 - discountPct / 100));
};

const assertUser = (req) => {
  const id = req.user?._id || req.user?.id;
  if (!id) {
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
  return id;
};

const enrichPickupLocation = (order, translations) => {
  const pickupLocationDoc = order?.delivery?.pickupLocationId;
  if (!pickupLocationDoc || typeof pickupLocationDoc !== "object") {
    return order;
  }

  const pickupLocation = buildLocationPresentation(pickupLocationDoc, translations);
  return {
    ...order,
    delivery: {
      ...(order.delivery || {}),
      pickupLocationId: pickupLocation,
      pickupLocation,
    },
  };
};

const enrichOrdersWithLocations = async (req, orders) => {
  const orderList = Array.isArray(orders) ? orders : [orders];
  if (!orderList.length) return Array.isArray(orders) ? [] : null;

  const translations = await loadLocationTranslations(resolveLocationLang(req));
  const enriched = orderList.map((order) => enrichPickupLocation(order, translations));
  return Array.isArray(orders) ? enriched : enriched[0];
};

const activeOrderCondition = () => ({
  $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
});

const withActiveOrders = (filter = {}) => ({
  $and: [filter, activeOrderCondition()],
});

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseAdminDate = (value, fieldName) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error(`${fieldName} is invalid`);
    error.statusCode = 400;
    throw error;
  }

  return date;
};

const getActorId = (req) => req.user?._id || req.user?.id || null;

const isSuperadmin = (req) => String(req.user?.role || "").toLowerCase() === "superadmin";

const populateAdminOrder = (query) =>
  ORDER_ADMIN_POPULATE.reduce((chain, populateConfig) => chain.populate(populateConfig), query);

const buildAdminOrderResponse = (order) => {
  if (!order) return order;

  const totals = order.totals || {};
  const subtotal = toNumber(totals.subtotal, 0);
  const totalSavings = toNumber(totals.totalSavings, 0);
  const cartTotal = toNumber(totals.cartTotal, Math.max(0, subtotal - totalSavings));
  const delivery = order.delivery || {};
  const deletedAt = order.deletedAt || null;

  return {
    ...order,
    id: String(order._id || order.id || ""),
    isDeleted: !!deletedAt,
    delivery: {
      ...delivery,
      addressLine: delivery.address || "",
      locationId: delivery.pickupLocationId?._id || delivery.pickupLocationId || null,
    },
    totals: {
      ...totals,
      subtotal,
      totalSavings,
      cartTotal,
      currency: totals.currency || "UAH",
    },
    pricing: {
      subtotal,
      savings: totalSavings,
      total: cartTotal,
      currency: totals.currency || "UAH",
    },
    admin: {
      note: order.adminNote || "",
      scheduledAt: order.scheduledAt || null,
      assignedTo: order.assignedTo || null,
      deletedAt,
      deletedBy: order.deletedBy || null,
      deletedReason: order.deletedReason || "",
    },
  };
};

const enrichAdminOrders = async (req, orders) => {
  const enriched = await enrichOrdersWithLocations(req, orders);
  return Array.isArray(enriched)
    ? enriched.map(buildAdminOrderResponse)
    : buildAdminOrderResponse(enriched);
};

const applyOrderRewardSideEffects = async (existingOrder, updatedOrder) => {
  const userId = existingOrder?.user?._id || existingOrder?.user;
  const rewardId = existingOrder?.appliedReward?.rewardId;

  if (rewardId && userId) {
    const rewardPayload = {
      userId,
      rewardId,
      orderId: existingOrder._id,
    };

    const wasRemovedFromCommerce =
      existingOrder.status !== "cancelled" && updatedOrder.status === "cancelled";
    const wasRestoredToCommerce =
      existingOrder.status === "cancelled" && updatedOrder.status !== "cancelled";
    const wasSoftDeleted = !existingOrder.deletedAt && updatedOrder.deletedAt;
    const wasRestoredFromDelete = existingOrder.deletedAt && !updatedOrder.deletedAt;

    if (wasRemovedFromCommerce || wasSoftDeleted) {
      await restoreRewardFromOrder(rewardPayload);
    }

    if (wasRestoredToCommerce || wasRestoredFromDelete) {
      await markRewardUsedByOrder(rewardPayload);
    }
  }

  if (userId) {
    await syncUserCommerceData(userId);
  }

  const needsLoyaltyBonusSync =
    existingOrder.status === "completed" ||
    updatedOrder.status === "completed";

  if (needsLoyaltyBonusSync) {
    await syncOrderLoyaltyEffects({
      ...updatedOrder,
      user: userId,
      _id: updatedOrder?._id || existingOrder?._id,
    });
  }
};

const loadAdminOrderOr404 = async (id) => {
  if (!isObjectId(id)) {
    const error = new Error("Invalid order id");
    error.statusCode = 400;
    throw error;
  }

  const order = await Order.findById(id).select("_id user status appliedReward deletedAt").lean();
  if (!order) {
    const error = new Error("Order not found");
    error.statusCode = 404;
    throw error;
  }

  return order;
};

const sendControllerError = (res, error, fallbackMessage, logLabel) => {
  const status = error.statusCode || 500;
  console.error(`❌ ${logLabel} error:`, error);
  res.status(status).json({ message: error.message || fallbackMessage });
};

/**
 * USER: POST /api/orders
 * Create my order and link it to the logged-in user.
 */
export const createMyOrder = async (req, res) => {
  try {
    const userId = assertUser(req);

    const payload = req.body || {};
    const requestedRewardId = pickStr(payload.rewardId || payload?.reward?.rewardId);

    // --- validate customer ---
    const customer = payload.customer || {};
    const fullName = pickStr(customer.fullName);
    const phone = normalizePhone(customer.phone);
    const email = pickStr(customer.email);

    // In your UI you mentioned server says: "Customer fullName, phone, city are required"
    // We'll keep similar validation here.
    if (!fullName) return res.status(400).json({ message: "Customer fullName is required" });
    if (!phone || phone.length < 10) return res.status(400).json({ message: "Customer phone is required" });

    // --- validate delivery ---
    const delivery = payload.delivery || {};
    const city = pickStr(delivery.city);
    const method = pickStr(delivery.method);

    if (!city) return res.status(400).json({ message: "Delivery city is required" });
    if (!["pickup", "courier", "nova_poshta"].includes(method)) {
      return res.status(400).json({ message: "Delivery method is invalid" });
    }

    let pickupLocationId = null;
    let address = "";
    let npOffice = "";

    if (method === "pickup") {
      const rawId = delivery.pickupLocationId ?? delivery.locationId ?? null;
      if (!rawId || !isObjectId(rawId)) {
        return res.status(400).json({ message: "pickupLocationId is required for pickup" });
      }

      // optional: verify location exists and is active
      const loc = await Location.findOne({ _id: rawId, isActive: true }).select("_id type city").lean();
      if (!loc) return res.status(400).json({ message: "Pickup location not found" });

      pickupLocationId = loc._id;
      address = "";
      npOffice = "";
    }

    if (method === "courier") {
      address = pickStr(delivery.address);
      if (!address) return res.status(400).json({ message: "address is required for courier" });
      pickupLocationId = null;
      npOffice = "";
    }

    if (method === "nova_poshta") {
      npOffice = pickStr(delivery.npOffice);
      if (!npOffice) return res.status(400).json({ message: "npOffice is required for nova_poshta" });
      pickupLocationId = null;
      address = "";
    }

    // --- validate items ---
    const itemsRaw = Array.isArray(payload.items) ? payload.items : [];
    if (itemsRaw.length === 0) return res.status(400).json({ message: "Order items are required" });

    // Collect ids
    const ids = itemsRaw
      .map((it) => it.productId)
      .filter(Boolean)
      .map(String)
      .filter(isObjectId);

    if (ids.length !== itemsRaw.length) {
      return res.status(400).json({ message: "Each item must contain valid productId" });
    }

    // Load products to create snapshot (name, price, sku, image)
    const products = await Product.find({ _id: { $in: ids } })
      .select("_id name price discount sku images image")
      .lean();

    const byId = new Map(products.map((p) => [String(p._id), p]));

    const items = itemsRaw.map((it) => {
      const p = byId.get(String(it.productId));
      if (!p) {
        // product removed or wrong id
        throw Object.assign(new Error("Product not found in items"), { statusCode: 400 });
      }

      const qty = Math.max(1, Math.floor(toNumber(it.qty, 1)));

      const priceSnapshot = computeProductUnitPrice(p);

      const nameSnapshot = pickStr(it.name) || pickStr(p?.name?.ua) || pickStr(p?.name?.en) || "Product";
      const skuSnapshot = pickStr(it.sku) || pickStr(p.sku) || "";
      const imageSnapshot =
        pickStr(it.image) ||
        pickStr(p.image) ||
        (Array.isArray(p.images) && p.images[0] ? String(p.images[0]) : "");

      return {
        productId: p._id,
        name: nameSnapshot,
        qty,
        price: priceSnapshot,
        sku: skuSnapshot,
        image: imageSnapshot,
      };
    });

    // --- totals ---
    const subtotal = roundMoney(items.reduce((sum, it) => sum + it.qty * it.price, 0));
    const discountSummary = await buildCheckoutDiscountSummary({
      userId,
      subtotal,
      rewardId: requestedRewardId,
    });

    if (requestedRewardId && !discountSummary.selectedReward) {
      return res.status(400).json({ message: "Reward is not available for this order" });
    }

    const comment = pickStr(payload.comment);

    const order = await Order.create({
      user: userId,
      customer: { fullName, phone, email },
      delivery: {
        city,
        method,
        pickupLocationId,
        address,
        npOffice,
      },
      comment,
      items,
      totals: {
        subtotal,
        loyaltyDiscount: discountSummary.loyaltyDiscount,
        rewardDiscount: discountSummary.rewardDiscount,
        totalSavings: discountSummary.totalSavings,
        cartTotal: discountSummary.cartTotal,
      },
      loyaltySnapshot: {
        cardNumber: discountSummary.loyalty.cardNumber || "",
        tier: discountSummary.loyalty.tier || "none",
        baseDiscountPct: toNumber(discountSummary.loyalty.baseDiscountPct, 0),
      },
      appliedReward: discountSummary.selectedReward
        ? {
            rewardId: discountSummary.selectedReward.rewardId || "",
            type: discountSummary.selectedReward.type || "",
            title: discountSummary.selectedReward.title || "",
            discountPct: toNumber(discountSummary.selectedReward.discountPct, 0),
            amountOff: toNumber(discountSummary.selectedReward.amountOff, 0),
            minOrderTotal: toNumber(discountSummary.selectedReward.minOrderTotal, 0),
          }
        : {
            rewardId: "",
            type: "",
            title: "",
            discountPct: 0,
            amountOff: 0,
            minOrderTotal: 0,
          },
      status: "new",
      scheduledAt: null,
      adminNote: "",
      assignedTo: null,
      statusHistory: [{ status: "new", changedAt: new Date(), changedBy: null, note: "Order created" }],
      cancelledAt: null,
      deletedAt: null,
      deletedBy: null,
      deletedReason: "",
    });

    // Link order to user (Variant B)
    // Ensure user schema has `orders: [{ type: ObjectId, ref: 'Order' }]`
    await User.updateOne(
      { _id: userId },
      {
        $addToSet: { orders: order._id },
        $set: {
          ...(phone ? { phone } : {}),
          ...(phone ? { phoneNormalized: normalizePhone(phone) } : {}),
          ...(city ? { city } : {}),
          lastSeen: new Date(),
          lastActivityAt: new Date(),
        },
      }
    );

    if (discountSummary.selectedReward?.rewardId) {
      await markRewardUsedByOrder({
        userId,
        rewardId: discountSummary.selectedReward.rewardId,
        orderId: order._id,
      });
    }

    await syncUserCommerceData(userId);

    const hydratedOrder = await Order.findById(order._id)
      .populate("delivery.pickupLocationId", PICKUP_LOCATION_SELECT)
      .lean();

    res.status(201).json(await enrichOrdersWithLocations(req, hydratedOrder));
  } catch (error) {
    const status = error.statusCode || 500;
    console.error("❌ createMyOrder error:", error);
    res.status(status).json({ message: error.message || "Server error creating order" });
  }
};

/**
 * USER: POST /api/orders/preview
 * Preview order totals with loyalty card and active reward.
 */
export const previewMyOrder = async (req, res) => {
  try {
    const userId = assertUser(req);
    const payload = req.body || {};
    const requestedRewardId = pickStr(payload.rewardId || payload?.reward?.rewardId);

    const itemsRaw = Array.isArray(payload.items) ? payload.items : [];
    if (itemsRaw.length === 0) return res.status(400).json({ message: "Order items are required" });

    const ids = itemsRaw
      .map((it) => it.productId)
      .filter(Boolean)
      .map(String)
      .filter(isObjectId);

    if (ids.length !== itemsRaw.length) {
      return res.status(400).json({ message: "Each item must contain valid productId" });
    }

    const products = await Product.find({ _id: { $in: ids } })
      .select("_id name price discount sku images image")
      .lean();

    const byId = new Map(products.map((p) => [String(p._id), p]));

    const items = itemsRaw.map((it) => {
      const p = byId.get(String(it.productId));
      if (!p) {
        throw Object.assign(new Error("Product not found in items"), { statusCode: 400 });
      }

      const qty = Math.max(1, Math.floor(toNumber(it.qty, 1)));
      const unitPrice = computeProductUnitPrice(p);

      return {
        productId: String(p._id),
        name: pickStr(it.name) || pickStr(p?.name?.ua) || pickStr(p?.name?.en) || "Product",
        qty,
        unitPrice,
        lineTotal: roundMoney(unitPrice * qty),
      };
    });

    const subtotal = roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0));
    const discountSummary = await buildCheckoutDiscountSummary({
      userId,
      subtotal,
      rewardId: requestedRewardId,
    });

    if (requestedRewardId && !discountSummary.selectedReward) {
      return res.status(400).json({ message: "Reward is not available for this order" });
    }

    return res.json({
      items,
      totals: {
        subtotal,
        loyaltyDiscount: discountSummary.loyaltyDiscount,
        rewardDiscount: discountSummary.rewardDiscount,
        totalSavings: discountSummary.totalSavings,
        cartTotal: discountSummary.cartTotal,
      },
      loyalty: discountSummary.loyalty,
      appliedReward: discountSummary.selectedReward
        ? {
            rewardId: discountSummary.selectedReward.rewardId,
            type: discountSummary.selectedReward.type,
            title: discountSummary.selectedReward.title,
            discountPct: toNumber(discountSummary.selectedReward.discountPct, 0),
            amountOff: toNumber(discountSummary.selectedReward.amountOff, 0),
            minOrderTotal: toNumber(discountSummary.selectedReward.minOrderTotal, 0),
          }
        : null,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    console.error("❌ previewMyOrder error:", error);
    res.status(status).json({ message: error.message || "Server error previewing order" });
  }
};

/**
 * USER: GET /api/orders/my
 */
export const listMyOrders = async (req, res) => {
  try {
    const userId = assertUser(req);
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const skip = (page - 1) * limit;
    const filter = withActiveOrders({ user: userId });

    const [items, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("delivery.pickupLocationId", PICKUP_LOCATION_SELECT)
        .lean(),
      Order.countDocuments(filter),
    ]);

    res.json({
      items: await enrichOrdersWithLocations(req, items),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error("❌ listMyOrders error:", error);
    res.status(500).json({ message: "Server error listing orders" });
  }
};

/**
 * USER: GET /api/orders/my/:id
 */
export const getMyOrder = async (req, res) => {
  try {
    const userId = assertUser(req);
    const { id } = req.params;

    if (!isObjectId(id)) return res.status(400).json({ message: "Invalid order id" });

    const order = await Order.findOne(withActiveOrders({ _id: id, user: userId }))
      .populate("delivery.pickupLocationId", PICKUP_LOCATION_SELECT)
      .lean();

    if (!order) return res.status(404).json({ message: "Order not found" });

    res.json(await enrichOrdersWithLocations(req, order));
  } catch (error) {
    console.error("❌ getMyOrder error:", error);
    res.status(500).json({ message: "Server error getting order" });
  }
};

/**
 * ADMIN: GET /api/orders and /api/admin/orders
 * Query: q, status, page, limit, deleted=active|all|only
 */
export const adminListOrders = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const skip = (page - 1) * limit;

    const status = pickStr(req.query.status);
    const q = pickStr(req.query.q || req.query.search);
    const deletedMode = pickStr(req.query.deleted || (req.query.includeDeleted ? "all" : "active"));

    const baseFilter = {};
    const andFilters = [baseFilter];

    if (status) {
      if (!ORDER_STATUS_SET.has(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      baseFilter.status = status;
    }

    if (deletedMode === "only") {
      andFilters.push({ deletedAt: { $ne: null } });
    } else if (deletedMode !== "all") {
      andFilters.push(activeOrderCondition());
    }

    if (q) {
      const re = new RegExp(escapeRegex(q), "i");
      const searchOr = [
        { "customer.fullName": re },
        { "customer.phone": re },
        { "customer.email": re },
        { "delivery.city": re },
        { comment: re },
        { adminNote: re },
        { "items.name": re },
        { "items.sku": re },
      ];

      if (isObjectId(q)) {
        searchOr.push({ _id: new mongoose.Types.ObjectId(q) });
      }

      const users = await User.find({ $or: [{ email: re }, { name: re }, { phone: re }] })
        .select("_id")
        .lean();
      const userIds = users.map((userDoc) => userDoc._id);

      if (userIds.length) {
        searchOr.push({ user: { $in: userIds } });
      }

      andFilters.push({ $or: searchOr });
    }

    const filter = andFilters.length > 1 ? { $and: andFilters } : baseFilter;

    const [items, total] = await Promise.all([
      populateAdminOrder(Order.find(filter))
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter),
    ]);

    res.json({
      items: await enrichAdminOrders(req, items),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      limit,
      statuses: ORDER_STATUSES,
    });
  } catch (error) {
    sendControllerError(res, error, "Server error listing orders", "adminListOrders");
  }
};

/**
 * ADMIN: GET /api/orders/:id and /api/admin/orders/:id
 */
export const adminGetOrder = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ message: "Invalid order id" });

    const order = await populateAdminOrder(Order.findById(id)).lean();
    if (!order) return res.status(404).json({ message: "Order not found" });

    res.json(await enrichAdminOrders(req, order));
  } catch (error) {
    sendControllerError(res, error, "Server error getting order", "adminGetOrder");
  }
};

const buildAdminOrderUpdate = (body, existingOrder, req) => {
  const patch = {};
  const push = {};
  const statusNote = pickStr(body.statusNote || body.note || body.reason || body.cancelReason || "");
  const actorId = getActorId(req);

  if (body.status !== undefined) {
    const status = pickStr(body.status);
    if (!ORDER_STATUS_SET.has(status)) {
      const error = new Error("Invalid status");
      error.statusCode = 400;
      throw error;
    }

    if (status !== existingOrder.status) {
      patch.status = status;
      patch.cancelledAt = status === "cancelled" ? new Date() : null;
      push.statusHistory = {
        status,
        changedAt: new Date(),
        changedBy: actorId,
        note: statusNote,
      };
    }
  }

  const scheduledAtRaw = body.scheduledAt !== undefined ? body.scheduledAt : body.admin?.scheduledAt;
  if (scheduledAtRaw !== undefined) {
    patch.scheduledAt = parseAdminDate(scheduledAtRaw, "scheduledAt");
  }

  const adminNoteRaw =
    body.adminNote !== undefined
      ? body.adminNote
      : body.note !== undefined
        ? body.note
        : body.admin?.note;
  if (adminNoteRaw !== undefined) {
    patch.adminNote = pickStr(adminNoteRaw).slice(0, 5000);
  }

  const assignedToRaw =
    body.assignedTo !== undefined
      ? body.assignedTo
      : body.assignedToId !== undefined
        ? body.assignedToId
        : body.admin?.assignedTo;
  if (assignedToRaw !== undefined) {
    if (!assignedToRaw) {
      patch.assignedTo = null;
    } else if (!isObjectId(assignedToRaw)) {
      const error = new Error("assignedTo is invalid");
      error.statusCode = 400;
      throw error;
    } else {
      patch.assignedTo = assignedToRaw;
    }
  }

  return { patch, push };
};

const updateOrderByAdmin = async (req, res, forcedBody = null) => {
  const { id } = req.params;
  const body = forcedBody || req.body || {};
  const existingOrder = await loadAdminOrderOr404(id);

  const { patch, push } = buildAdminOrderUpdate(body, existingOrder, req);
  const update = {};

  if (Object.keys(patch).length) update.$set = patch;
  if (Object.keys(push).length) update.$push = push;

  if (!Object.keys(update).length) {
    const error = new Error("Nothing to update");
    error.statusCode = 400;
    throw error;
  }

  const updated = await populateAdminOrder(
    Order.findByIdAndUpdate(id, update, { new: true })
  ).lean();

  await applyOrderRewardSideEffects(existingOrder, updated);

  return res.json(await enrichAdminOrders(req, updated));
};

/**
 * ADMIN: PATCH /api/orders/:id and /api/admin/orders/:id
 * Body: { status?, scheduledAt?, adminNote?, assignedTo? }
 */
export const adminPatchOrder = async (req, res) => {
  try {
    await updateOrderByAdmin(req, res);
  } catch (error) {
    sendControllerError(res, error, "Server error updating order", "adminPatchOrder");
  }
};

/**
 * ADMIN: PATCH /api/admin/orders/:id/status
 * Body: { status, note? }
 */
export const adminUpdateOrderStatus = async (req, res) => {
  try {
    await updateOrderByAdmin(req, res, {
      status: req.body?.status,
      statusNote: req.body?.note || req.body?.reason || req.body?.statusNote || "",
    });
  } catch (error) {
    sendControllerError(res, error, "Server error updating order status", "adminUpdateOrderStatus");
  }
};

/**
 * ADMIN: PATCH /api/admin/orders/:id/note
 * Body: { adminNote|note }
 */
export const adminUpdateOrderNote = async (req, res) => {
  try {
    await updateOrderByAdmin(req, res, {
      adminNote: req.body?.adminNote ?? req.body?.note ?? "",
    });
  } catch (error) {
    sendControllerError(res, error, "Server error updating order note", "adminUpdateOrderNote");
  }
};

/**
 * ADMIN: PATCH /api/admin/orders/:id/schedule
 * Body: { scheduledAt }
 */
export const adminScheduleOrder = async (req, res) => {
  try {
    await updateOrderByAdmin(req, res, {
      scheduledAt: req.body?.scheduledAt ?? null,
    });
  } catch (error) {
    sendControllerError(res, error, "Server error scheduling order", "adminScheduleOrder");
  }
};

/**
 * ADMIN: POST /api/orders/:id/cancel and /api/admin/orders/:id/cancel
 * Body: { note|reason }
 */
export const adminCancelOrder = async (req, res) => {
  try {
    const reason = pickStr(req.body?.note || req.body?.reason || "");
    await updateOrderByAdmin(req, res, {
      status: "cancelled",
      statusNote: reason,
      ...(reason ? { adminNote: reason } : {}),
    });
  } catch (error) {
    sendControllerError(res, error, "Server error cancelling order", "adminCancelOrder");
  }
};

/**
 * ADMIN: POST /api/admin/orders/:id/restore
 * Restores soft-deleted order and optionally changes status.
 */
export const adminRestoreOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const existingOrder = await loadAdminOrderOr404(id);
    const status = pickStr(req.body?.status || existingOrder.status || "new");

    if (!ORDER_STATUS_SET.has(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const update = {
      $set: {
        deletedAt: null,
        deletedBy: null,
        deletedReason: "",
        status,
        cancelledAt: status === "cancelled" ? existingOrder.cancelledAt || new Date() : null,
      },
      $push: {
        statusHistory: {
          status,
          changedAt: new Date(),
          changedBy: getActorId(req),
          note: pickStr(req.body?.note || "Order restored"),
        },
      },
    };

    const updated = await populateAdminOrder(
      Order.findByIdAndUpdate(id, update, { new: true })
    ).lean();

    await User.updateOne({ _id: existingOrder.user }, { $addToSet: { orders: existingOrder._id } });
    await applyOrderRewardSideEffects(existingOrder, updated);

    res.json(await enrichAdminOrders(req, updated));
  } catch (error) {
    sendControllerError(res, error, "Server error restoring order", "adminRestoreOrder");
  }
};

/**
 * ADMIN: DELETE /api/orders/:id and /api/admin/orders/:id
 * Default is soft delete. Superadmin can hard delete with ?force=true.
 */
export const adminDeleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await loadAdminOrderOr404(id);
    const force = String(req.query.force || req.body?.force || "").toLowerCase() === "true";
    const reason = pickStr(req.body?.reason || req.body?.note || "");

    if (force) {
      if (!isSuperadmin(req)) {
        return res.status(403).json({ message: "Only superadmin can force delete orders" });
      }

      await Order.deleteOne({ _id: order._id });
      await User.updateOne({ _id: order.user }, { $pull: { orders: order._id } });

      const deletedSnapshot = { ...order, deletedAt: new Date() };
      await applyOrderRewardSideEffects(order, deletedSnapshot);

      return res.json({ ok: true, deleted: true, force: true });
    }

    const updated = await populateAdminOrder(
      Order.findByIdAndUpdate(
        id,
        {
          $set: {
            deletedAt: new Date(),
            deletedBy: getActorId(req),
            deletedReason: reason,
          },
          $push: {
            statusHistory: {
              status: order.status,
              changedAt: new Date(),
              changedBy: getActorId(req),
              note: reason || "Order deleted",
            },
          },
        },
        { new: true }
      )
    ).lean();

    await User.updateOne({ _id: order.user }, { $pull: { orders: order._id } });
    await applyOrderRewardSideEffects(order, updated);

    res.json({ ok: true, deleted: true, order: await enrichAdminOrders(req, updated) });
  } catch (error) {
    sendControllerError(res, error, "Server error deleting order", "adminDeleteOrder");
  }
};
