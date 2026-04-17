// server/models/Order.js
import mongoose from "mongoose";

export const ORDER_STATUSES = ["new", "confirmed", "processing", "shipped", "completed", "cancelled"];

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true }, // snapshot
    qty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 }, // snapshot per item
    sku: { type: String, default: "" },
    image: { type: String, default: "" },
  },
  { _id: false }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    note: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    customer: {
      fullName: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true },
      email: { type: String, trim: true, default: "" },
    },

    delivery: {
      city: { type: String, required: true, trim: true },
      method: { type: String, enum: ["pickup", "courier", "nova_poshta"], required: true },
      pickupLocationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", default: null },
      address: { type: String, trim: true, default: "" },
      npOffice: { type: String, trim: true, default: "" },
    },

    comment: { type: String, trim: true, default: "" },

    items: { type: [orderItemSchema], required: true },

    totals: {
      subtotal: { type: Number, required: true, min: 0 },
      loyaltyDiscount: { type: Number, default: 0, min: 0 },
      rewardDiscount: { type: Number, default: 0, min: 0 },
      totalSavings: { type: Number, default: 0, min: 0 },
      cartTotal: { type: Number, required: true, min: 0 },
    },

    loyaltySnapshot: {
      cardNumber: { type: String, default: "" },
      tier: { type: String, default: "none" },
      baseDiscountPct: { type: Number, default: 0, min: 0, max: 100 },
    },

    appliedReward: {
      rewardId: { type: String, default: "" },
      type: { type: String, default: "" },
      title: { type: String, default: "" },
      discountPct: { type: Number, default: 0, min: 0, max: 100 },
      amountOff: { type: Number, default: 0, min: 0 },
      minOrderTotal: { type: Number, default: 0, min: 0 },
    },

    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: "new",
      index: true,
    },

    scheduledAt: { type: Date, default: null },     // дата/час (якщо адмін планує)
    adminNote: { type: String, trim: true, default: "" },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    statusHistory: { type: [statusHistorySchema], default: [] },

    cancelledAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    deletedReason: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ "customer.email": 1 });
orderSchema.index({ deletedAt: 1, createdAt: -1 });

export default mongoose.models.Order || mongoose.model("Order", orderSchema);
