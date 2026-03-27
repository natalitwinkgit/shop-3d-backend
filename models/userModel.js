// server/models/userModel.js
import mongoose from "mongoose";

const likeSchema = new mongoose.Schema({
  productId: { type: String, required: true },
  productName: { ua: { type: String, default: "" }, en: { type: String, default: "" } },
  productCategory: { type: String, default: "" },
  productImage: { type: String, default: "" },
  discount: { type: Number, default: 0 },
  price: { type: Number, default: 0 },
}, { _id: false });

/* ✅ Order items snapshot */
const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },

  // snapshot for history
  sku: { type: String, default: "" },
  name: {
    ua: { type: String, default: "" },
    en: { type: String, default: "" },
  },
  image: { type: String, default: "" },
  category: { type: String, default: "" },
  subCategory: { type: String, default: "" },

  qty: { type: Number, required: true, min: 1 },

  // computed server-side
  unitPrice: { type: Number, required: true, min: 0 },      // price after discount
  discountPct: { type: Number, default: 0, min: 0, max: 100 },
  lineTotal: { type: Number, required: true, min: 0 },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ["new", "confirmed", "processing", "shipped", "completed", "cancelled"],
    default: "new",
  },

  customer: {
    fullName: { type: String, required: true },
phone: {
  type: String,
  default: null,
  trim: true,
}
,    email: { type: String, default: "" },
  },

  delivery: {
    method: { type: String, enum: ["pickup", "courier", "nova_poshta"], required: true },
    city: { type: String, required: true },

    // pickup
    pickupLocationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", default: null },

    // courier
    address: { type: String, default: "" },

    // nova_poshta
    npOffice: { type: String, default: "" },
  },

  items: { type: [orderItemSchema], default: [] },

  totals: {
    subtotal: { type: Number, default: 0 },       // without discounts
    loyaltyDiscount: { type: Number, default: 0 },
    rewardDiscount: { type: Number, default: 0 },
    discountTotal: { type: Number, default: 0 },  // subtotal - cartTotal
    cartTotal: { type: Number, default: 0 },      // to pay
    currency: { type: String, default: "UAH" },
  },

  loyaltySnapshot: {
    cardNumber: { type: String, default: "" },
    tier: { type: String, default: "none" },
    baseDiscountPct: { type: Number, default: 0 },
  },

  appliedReward: {
    rewardId: { type: String, default: "" },
    type: { type: String, default: "" },
    title: { type: String, default: "" },
    discountPct: { type: Number, default: 0 },
    amountOff: { type: Number, default: 0 },
    minOrderTotal: { type: Number, default: 0 },
  },

  comment: { type: String, default: "" },

  // admin fields
  adminNote: { type: String, default: "" },
  scheduledAt: { type: Date, default: null },

  cancelledAt: { type: Date, default: null },
  cancelReason: { type: String, default: "" },
}, { timestamps: true });

const rewardSchema = new mongoose.Schema({
  rewardId: {
    type: String,
    default: () => new mongoose.Types.ObjectId().toHexString(),
  },
  type: {
    type: String,
    enum: ["next_order_discount", "manual_discount"],
    default: "next_order_discount",
  },
  title: { type: String, default: "" },
  description: { type: String, default: "" },
  discountPct: { type: Number, default: 0, min: 0, max: 100 },
  amountOff: { type: Number, default: 0, min: 0 },
  minOrderTotal: { type: Number, default: 0, min: 0 },
  status: {
    type: String,
    enum: ["active", "used", "expired", "cancelled"],
    default: "active",
  },
  issuedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null },
  usedAt: { type: Date, default: null },
  usedOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
  note: { type: String, default: "" },
}, { _id: false });

const loyaltySchema = new mongoose.Schema({
  cardNumber: {
    type: String,
    default: () => `DC-${new mongoose.Types.ObjectId().toHexString().slice(-8).toUpperCase()}`,
  },
  tier: {
    type: String,
    enum: ["none", "silver", "gold", "platinum"],
    default: "none",
  },
  baseDiscountPct: { type: Number, default: 0, min: 0, max: 100 },
  totalSpent: { type: Number, default: 0, min: 0 },
  completedOrders: { type: Number, default: 0, min: 0 },
  lastOrderAt: { type: Date, default: null },
  notes: { type: String, default: "" },
  manualOverride: { type: Boolean, default: false },
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String, default: "" },

  role: { type: String, enum: ["user", "admin"], default: "user" },
  status: { type: String, enum: ["active", "banned"], default: "active" },
  isAiAssistant: { type: Boolean, default: false, index: true },

  isOnline: { type: Boolean, default: false },
  presence: { type: String, enum: ["online", "away", "offline"], default: "offline", index: true },
  lastSeen: { type: Date, default: Date.now },
  lastActivityAt: { type: Date, default: Date.now },
  lastHeartbeatAt: { type: Date, default: null },
  lastLoginAt: { type: Date, default: null },
  lastLogoutAt: { type: Date, default: null },
  lastPage: { type: String, default: "" },

  likes: [likeSchema],

  // ✅ embedded orders
  orders: { type: [orderSchema], default: [] },

  loyalty: { type: loyaltySchema, default: () => ({}) },
  rewards: { type: [rewardSchema], default: [] },

  resetCode: { type: String },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model("User", userSchema);
export default User;
