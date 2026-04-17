// server/models/userModel.js
import mongoose from "mongoose";

export const USER_ROLES = ["user", "admin", "superadmin"];
export const ADMIN_ROLES = ["admin", "superadmin"];
export const USER_STATUSES = ["active", "banned"];

export const normalizePhone = (value) =>
  String(value || "").replace(/[^\d+]/g, "").trim();

export const isValidPhone = (value) =>
  normalizePhone(value).replace(/\D/g, "").length >= 10;

export const isAdminRole = (role) =>
  ADMIN_ROLES.includes(String(role || "").trim().toLowerCase());

export const getStoredPasswordHash = (userDoc) =>
  String(userDoc?.passwordHash || userDoc?.password || "");

const likeSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true },
    productName: { ua: { type: String, default: "" }, en: { type: String, default: "" } },
    productCategory: { type: String, default: "" },
    productImage: { type: String, default: "" },
    discount: { type: Number, default: 0 },
    price: { type: Number, default: 0 },
  },
  { _id: false }
);

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    sku: { type: String, default: "" },
    name: {
      ua: { type: String, default: "" },
      en: { type: String, default: "" },
    },
    image: { type: String, default: "" },
    category: { type: String, default: "" },
    subCategory: { type: String, default: "" },
    qty: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    discountPct: { type: Number, default: 0, min: 0, max: 100 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["new", "confirmed", "processing", "shipped", "completed", "cancelled"],
      default: "new",
    },
    customer: {
      fullName: { type: String, required: true },
      phone: { type: String, default: null, trim: true },
      email: { type: String, default: "" },
    },
    delivery: {
      method: { type: String, enum: ["pickup", "courier", "nova_poshta"], required: true },
      city: { type: String, required: true },
      pickupLocationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Location",
        default: null,
      },
      address: { type: String, default: "" },
      npOffice: { type: String, default: "" },
    },
    items: { type: [orderItemSchema], default: [] },
    totals: {
      subtotal: { type: Number, default: 0 },
      loyaltyDiscount: { type: Number, default: 0 },
      rewardDiscount: { type: Number, default: 0 },
      discountTotal: { type: Number, default: 0 },
      totalSavings: { type: Number, default: 0 },
      cartTotal: { type: Number, default: 0 },
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
    adminNote: { type: String, default: "" },
    scheduledAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: "" },
  },
  { timestamps: true }
);

const rewardSchema = new mongoose.Schema(
  {
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
  },
  { _id: false }
);

const loyaltySchema = new mongoose.Schema(
  {
    cardNumber: {
      type: String,
      default: () =>
        `DC-${new mongoose.Types.ObjectId().toHexString().slice(-8).toUpperCase()}`,
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
  },
  { _id: false }
);

const addressSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    label: { type: String, default: "", trim: true },
    city: { type: String, default: "", trim: true },
    addressLine: { type: String, default: "", trim: true },
    comment: { type: String, default: "", trim: true },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "" },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    phoneNormalized: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    passwordHash: {
      type: String,
      default: "",
      select: false,
    },
    password: {
      type: String,
      default: "",
      select: false,
    },
    role: {
      type: String,
      enum: USER_ROLES,
      default: "user",
      index: true,
    },
    status: {
      type: String,
      enum: USER_STATUSES,
      default: "active",
      index: true,
    },
    city: { type: String, trim: true, default: "" },
    avatar: { type: String, default: "" },
    avatarUpdatedAt: { type: Date, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    isAiAssistant: { type: Boolean, default: false, index: true },
    isOnline: { type: Boolean, default: false },
    presence: {
      type: String,
      enum: ["online", "away", "offline"],
      default: "offline",
      index: true,
    },
    lastSeen: { type: Date, default: null },
    lastActivityAt: { type: Date, default: null },
    lastHeartbeatAt: { type: Date, default: null },
    lastLogoutAt: { type: Date, default: null },
    lastPage: { type: String, default: "" },
    likes: [likeSchema],
    addresses: { type: [addressSchema], default: [] },
    orders: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
    loyalty: { type: loyaltySchema, default: () => ({}) },
    rewards: { type: [rewardSchema], default: [] },
    resetCode: { type: String },
    resetPasswordTokenHash: {
      type: String,
      default: "",
      select: false,
      index: true,
    },
    resetPasswordExpiresAt: {
      type: Date,
      default: null,
      select: false,
      index: true,
    },
    resetPasswordRequestedAt: {
      type: Date,
      default: null,
      select: false,
    },
  },
  { timestamps: true }
);

userSchema.index(
  { phoneNormalized: 1 },
  {
    unique: true,
    partialFilterExpression: {
      phoneNormalized: { $type: "string", $gt: "" },
    },
  }
);

userSchema.pre("validate", function syncUserFields(next) {
  this.email = String(this.email || "").trim().toLowerCase();
  this.phone = normalizePhone(this.phone);
  this.phoneNormalized = normalizePhone(this.phoneNormalized || this.phone);

  if (!this.passwordHash && this.password) {
    this.passwordHash = this.password;
  }

  if (!this.loyalty?.cardNumber) {
    this.loyalty = {
      ...(this.loyalty?.toObject ? this.loyalty.toObject() : this.loyalty || {}),
      cardNumber: `DC-${String(this._id || new mongoose.Types.ObjectId()).slice(-8).toUpperCase()}`,
    };
  }

  next();
});

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
