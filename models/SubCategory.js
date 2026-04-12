import mongoose from "mongoose";

const SubcategorySchema = new mongoose.Schema(
  {
    // ключ батьківської категорії: "sofas", "tables"...
    categoryKey: { type: String, required: true, trim: true, index: true },

    // ключ підкатегорії: "straight", "corner"...
    key: { type: String, required: true, trim: true, index: true },

    // багатомовна назва
    name: {
      ua: { type: String, default: "" },
      en: { type: String, default: "" },
    },
    description: {
      ua: { type: String, default: "" },
      en: { type: String, default: "" },
    },

    // порядок у списку (не обов’язково)
    sort: { type: Number, default: 0 },

    // видимість
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// унікальність: однаковий key не може повторитись в межах однієї категорії
SubcategorySchema.index({ categoryKey: 1, key: 1 }, { unique: true });

export default mongoose.model("Subcategory", SubcategorySchema);
