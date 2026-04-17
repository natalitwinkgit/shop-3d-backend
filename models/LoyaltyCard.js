import mongoose from "mongoose";

export const LOYALTY_TIERS = ["none", "silver", "gold", "platinum"];

const loyaltyCardSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    cardNumber: { type: String, required: true, unique: true, trim: true, index: true },
    tier: { type: String, enum: LOYALTY_TIERS, default: "none", index: true },
    baseDiscountPct: { type: Number, default: 0, min: 0, max: 100 },
    bonusBalance: { type: Number, default: 0, min: 0 },
    totalEarned: { type: Number, default: 0, min: 0 },
    totalRedeemed: { type: Number, default: 0, min: 0 },
    totalExpired: { type: Number, default: 0, min: 0 },
    totalSpent: { type: Number, default: 0, min: 0 },
    completedOrders: { type: Number, default: 0, min: 0 },
    lastOrderAt: { type: Date, default: null },
    earnRatePct: { type: Number, default: 3, min: 0, max: 100 },
    bonusTtlDays: { type: Number, default: 365, min: 1 },
    manualOverride: { type: Boolean, default: false },
    notes: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

loyaltyCardSchema.index({ user: 1, isActive: 1 });

export default mongoose.models.LoyaltyCard || mongoose.model("LoyaltyCard", loyaltyCardSchema);
