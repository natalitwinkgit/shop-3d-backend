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
    discountTotal: { type: Number, default: 0 },  // subtotal - cartTotal
    cartTotal: { type: Number, default: 0 },      // to pay
    currency: { type: String, default: "UAH" },
  },

  comment: { type: String, default: "" },

  // admin fields
  adminNote: { type: String, default: "" },
  scheduledAt: { type: Date, default: null },

  cancelledAt: { type: Date, default: null },
  cancelReason: { type: String, default: "" },
}, { timestamps: true });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  role: { type: String, enum: ["user", "admin"], default: "user" },
  status: { type: String, enum: ["active", "banned"], default: "active" },

  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now },

  likes: [likeSchema],

  // ✅ embedded orders
  orders: { type: [orderSchema], default: [] },

  resetCode: { type: String },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model("User", userSchema);
export default User;
