import mongoose from "mongoose";

export const PRODUCT_QUESTION_STATUSES = Object.freeze([
  "new",
  "answered",
  "closed",
  "spam",
]);

export const PRODUCT_QUESTION_SOURCES = Object.freeze([
  "product_page",
  "api",
  "chat",
  "admin",
]);

const localizedNameSchema = new mongoose.Schema(
  {
    ua: { type: String, trim: true, default: "" },
    en: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const productSnapshotSchema = new mongoose.Schema(
  {
    name: { type: localizedNameSchema, default: () => ({}) },
    sku: { type: String, trim: true, default: "" },
    slug: { type: String, trim: true, default: "" },
    pageUrl: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
    phone: { type: String, trim: true, maxlength: 40, default: "" },
  },
  { _id: false }
);

const adminReplySchema = new mongoose.Schema(
  {
    message: { type: String, trim: true, maxlength: 5000, default: "" },
    repliedAt: { type: Date, default: null },
    repliedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    emailSent: { type: Boolean, default: false },
  },
  { _id: false }
);

const productQuestionSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    productSnapshot: { type: productSnapshotSchema, required: true, default: () => ({}) },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    customer: { type: customerSchema, required: true },
    message: { type: String, required: true, trim: true, maxlength: 3000 },
    status: {
      type: String,
      enum: PRODUCT_QUESTION_STATUSES,
      default: "new",
      index: true,
    },
    source: {
      type: String,
      enum: PRODUCT_QUESTION_SOURCES,
      default: "product_page",
    },
    isRead: { type: Boolean, default: false },
    adminReply: { type: adminReplySchema, default: () => ({}) },
  },
  { timestamps: true }
);

productQuestionSchema.index({ createdAt: -1 });
productQuestionSchema.index({ "customer.email": 1 });
productQuestionSchema.index({ "productSnapshot.sku": 1 });

export default mongoose.models.ProductQuestion ||
  mongoose.model("ProductQuestion", productQuestionSchema);
