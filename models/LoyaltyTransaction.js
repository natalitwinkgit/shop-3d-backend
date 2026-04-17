import mongoose from "mongoose";

export const LOYALTY_TRANSACTION_TYPES = [
  "purchase",
  "bonus_earned",
  "bonus_redeemed",
  "bonus_expired",
  "bonus_cancelled",
  "manual_adjustment",
  "tier_changed",
];

export const LOYALTY_TRANSACTION_DIRECTIONS = ["credit", "debit", "info"];
export const LOYALTY_TRANSACTION_STATUSES = ["active", "used", "expired", "cancelled"];

const loyaltyTransactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    card: { type: mongoose.Schema.Types.ObjectId, ref: "LoyaltyCard", required: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null, index: true },
    type: { type: String, enum: LOYALTY_TRANSACTION_TYPES, required: true, index: true },
    direction: { type: String, enum: LOYALTY_TRANSACTION_DIRECTIONS, required: true },
    status: { type: String, enum: LOYALTY_TRANSACTION_STATUSES, default: "active", index: true },
    amount: { type: Number, default: 0, min: 0 },
    remainingAmount: { type: Number, default: 0, min: 0 },
    balanceAfter: { type: Number, default: 0, min: 0 },
    title: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    issuedAt: { type: Date, default: Date.now, index: true },
    expiresAt: { type: Date, default: null, index: true },
    usedAt: { type: Date, default: null },
    usedOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null, index: true },
    sourceTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoyaltyTransaction",
      default: null,
      index: true,
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

loyaltyTransactionSchema.index({ user: 1, status: 1, expiresAt: 1 });
loyaltyTransactionSchema.index({ user: 1, createdAt: -1 });
loyaltyTransactionSchema.index(
  { order: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: {
      order: { $exists: true, $ne: null },
      type: "bonus_earned",
    },
  }
);

export default mongoose.models.LoyaltyTransaction ||
  mongoose.model("LoyaltyTransaction", loyaltyTransactionSchema);
