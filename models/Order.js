// server/models/Order.js
import mongoose from "mongoose";

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
      enum: ["new", "confirmed", "processing", "shipped", "completed", "cancelled"],
      default: "new",
      index: true,
    },

    scheduledAt: { type: Date, default: null },     // дата/час (якщо адмін планує)
    adminNote: { type: String, trim: true, default: "" },

    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.Order || mongoose.model("Order", orderSchema);
