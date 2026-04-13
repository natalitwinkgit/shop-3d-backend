import mongoose from "mongoose";

const localizedTextSchema = new mongoose.Schema(
  {
    ua: { type: String, required: true, trim: true },
    en: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const productCollectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    name: { type: localizedTextSchema, required: true },
    description: {
      ua: { type: String, default: "", trim: true },
      en: { type: String, default: "", trim: true },
    },
    aliases: { type: [String], default: [] },
    sortOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

const normalizeKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

productCollectionSchema.pre("validate", function normalizeProductCollection(next) {
  this.key = normalizeKey(this.key);
  this.aliases = Array.from(
    new Set((Array.isArray(this.aliases) ? this.aliases : []).map(normalizeKey).filter(Boolean))
  );

  next();
});

export default mongoose.models.ProductCollection ||
  mongoose.model("ProductCollection", productCollectionSchema);
