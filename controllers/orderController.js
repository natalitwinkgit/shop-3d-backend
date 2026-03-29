// server/controllers/orderController.js
import mongoose from "mongoose";
import Order from "../models/Order.js";
import User from "../models/userModel.js";
import Product from "../models/Product.js";
import Location from "../models/Location.js";
import {
  buildCheckoutDiscountSummary,
  markRewardUsedByOrder,
  restoreRewardFromOrder,
  syncUserCommerceData,
} from "../services/userProfileService.js";

const isObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v || ""));

const normalizePhone = (s) => String(s || "").replace(/[^\d+]/g, "").trim();

const toNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const pickStr = (v) => String(v ?? "").trim();

const roundMoney = (value) => Math.max(0, Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100);

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
      cancelledAt: null,
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

    res.status(201).json(order);
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

    const [items, total] = await Promise.all([
      Order.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments({ user: userId }),
    ]);

    res.json({
      items,
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

    const order = await Order.findOne({ _id: id, user: userId })
      .populate("delivery.pickupLocationId", "type city nameKey addressKey phone workingHours coordinates")
      .lean();

    if (!order) return res.status(404).json({ message: "Order not found" });

    res.json(order);
  } catch (error) {
    console.error("❌ getMyOrder error:", error);
    res.status(500).json({ message: "Server error getting order" });
  }
};

/**
 * ADMIN: GET /api/orders
 * Query: q, status, page, limit
 * q searches customer.fullName/phone/email and also user email/name.
 */
export const adminListOrders = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const skip = (page - 1) * limit;

    const status = pickStr(req.query.status);
    const q = pickStr(req.query.q);

    const filter = {};
    if (status && ["new", "confirmed", "processing", "shipped", "completed", "cancelled"].includes(status)) {
      filter.status = status;
    }

    // Base query
    let query = Order.find(filter);

    // q with user join: simplest approach: if q exists, populate user and filter in-memory is heavy.
    // Better: use $or on customer fields; and if q looks like email, also match user by query separate.
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { "customer.fullName": re },
        { "customer.phone": re },
        { "customer.email": re },
        { "delivery.city": re },
      ];

      // additionally match by user (name/email) by looking up user ids
      const users = await User.find({ $or: [{ email: re }, { name: re }] }).select("_id").lean();
      const userIds = users.map((u) => u._id);

      if (userIds.length) {
        filter.$or.push({ user: { $in: userIds } });
      }

      query = Order.find(filter);
    }

    const [items, total] = await Promise.all([
      query
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "name email")
        .lean(),
      Order.countDocuments(filter),
    ]);

    // Return minimal list fields (your AdminOrders expects: _id, customer, status, createdAt, totals/cartTotal)
    res.json({
      items,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error("❌ adminListOrders error:", error);
    res.status(500).json({ message: "Server error listing orders" });
  }
};

/**
 * ADMIN: GET /api/orders/:id
 */
export const adminGetOrder = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ message: "Invalid order id" });

    const order = await Order.findById(id)
      .populate("user", "name email")
      .populate("delivery.pickupLocationId", "type city nameKey addressKey phone workingHours coordinates isActive")
      .lean();

    if (!order) return res.status(404).json({ message: "Order not found" });

    res.json(order);
  } catch (error) {
    console.error("❌ adminGetOrder error:", error);
    res.status(500).json({ message: "Server error getting order" });
  }
};

/**
 * ADMIN: PATCH /api/orders/:id
 * Body: { status?, scheduledAt?, adminNote? }
 */
export const adminPatchOrder = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ message: "Invalid order id" });

    const body = req.body || {};
    const existingOrder = await Order.findById(id).select("_id user status appliedReward").lean();
    if (!existingOrder) return res.status(404).json({ message: "Order not found" });

    const patch = {};

    if (body.status) {
      const st = pickStr(body.status);
      const allowed = ["new", "confirmed", "processing", "shipped", "completed", "cancelled"];
      if (!allowed.includes(st)) return res.status(400).json({ message: "Invalid status" });
      patch.status = st;
      if (st !== "cancelled") patch.cancelledAt = null;
      if (st === "cancelled" && !patch.cancelledAt) patch.cancelledAt = new Date();
    }

    if (body.scheduledAt !== undefined) {
      // can be null
      if (body.scheduledAt === null || body.scheduledAt === "") {
        patch.scheduledAt = null;
      } else {
        const d = new Date(body.scheduledAt);
        if (Number.isNaN(d.getTime())) return res.status(400).json({ message: "Invalid scheduledAt" });
        patch.scheduledAt = d;
      }
    }

    if (body.adminNote !== undefined) {
      patch.adminNote = pickStr(body.adminNote);
    }

    // Also support your previous AdminOrders payload shape:
    // { admin: { note, scheduledAt }, status }
    if (body.admin && typeof body.admin === "object") {
      if (body.admin.note !== undefined) patch.adminNote = pickStr(body.admin.note);
      if (body.admin.scheduledAt !== undefined) {
        if (body.admin.scheduledAt === null || body.admin.scheduledAt === "") {
          patch.scheduledAt = null;
        } else {
          const d = new Date(body.admin.scheduledAt);
          if (Number.isNaN(d.getTime())) return res.status(400).json({ message: "Invalid admin.scheduledAt" });
          patch.scheduledAt = d;
        }
      }
    }

    const updated = await Order.findByIdAndUpdate(id, { $set: patch }, { new: true })
      .populate("user", "name email")
      .populate("delivery.pickupLocationId", "type city nameKey addressKey phone workingHours coordinates")
      .lean();

    if (existingOrder.appliedReward?.rewardId) {
      const rewardPayload = {
        userId: existingOrder.user?._id || existingOrder.user,
        rewardId: existingOrder.appliedReward.rewardId,
        orderId: existingOrder._id,
      };

      if (existingOrder.status !== "cancelled" && updated.status === "cancelled") {
        await restoreRewardFromOrder(rewardPayload);
      }

      if (existingOrder.status === "cancelled" && updated.status !== "cancelled") {
        await markRewardUsedByOrder(rewardPayload);
      }
    }

    if (existingOrder.user?._id || existingOrder.user) {
      await syncUserCommerceData(existingOrder.user?._id || existingOrder.user);
    }

    res.json(updated);
  } catch (error) {
    console.error("❌ adminPatchOrder error:", error);
    res.status(500).json({ message: "Server error updating order" });
  }
};

/**
 * ADMIN: POST /api/orders/:id/cancel
 * Body: { note? }  (optional)
 */
export const adminCancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ message: "Invalid order id" });

    const note = pickStr(req.body?.note || req.body?.reason || "");
    const existingOrder = await Order.findById(id).select("_id user status appliedReward").lean();
    if (!existingOrder) return res.status(404).json({ message: "Order not found" });

    const updated = await Order.findByIdAndUpdate(
      id,
      {
        $set: {
          status: "cancelled",
          cancelledAt: new Date(),
          adminNote: note ? note : undefined,
        },
      },
      { new: true }
    )
      .populate("user", "name email")
      .lean();

    if (existingOrder.appliedReward?.rewardId && existingOrder.status !== "cancelled") {
      await restoreRewardFromOrder({
        userId: existingOrder.user?._id || existingOrder.user,
        rewardId: existingOrder.appliedReward.rewardId,
        orderId: existingOrder._id,
      });
    }

    if (existingOrder.user?._id || existingOrder.user) {
      await syncUserCommerceData(existingOrder.user?._id || existingOrder.user);
    }

    // if adminNote is undefined, mongoose won't remove old value. That’s ok.
    // If you want to clear adminNote when empty, handle it via PATCH.

    res.json(updated);
  } catch (error) {
    console.error("❌ adminCancelOrder error:", error);
    res.status(500).json({ message: "Server error cancelling order" });
  }
};

/**
 * ADMIN: DELETE /api/orders/:id
 * Also removes the orderId from user.orders array.
 */
export const adminDeleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ message: "Invalid order id" });

    const order = await Order.findById(id).select("_id user appliedReward").lean();
    if (!order) return res.status(404).json({ message: "Order not found" });

    await Order.deleteOne({ _id: id });
    await User.updateOne({ _id: order.user }, { $pull: { orders: order._id } });
    if (order.appliedReward?.rewardId) {
      await restoreRewardFromOrder({
        userId: order.user,
        rewardId: order.appliedReward.rewardId,
        orderId: order._id,
      });
    }
    if (order.user) {
      await syncUserCommerceData(order.user);
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("❌ adminDeleteOrder error:", error);
    res.status(500).json({ message: "Server error deleting order" });
  }
};
