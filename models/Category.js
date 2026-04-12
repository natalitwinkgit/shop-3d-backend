import mongoose from "mongoose";

const subCategorySchema = new mongoose.Schema(
  {
    key: { type: String, required: true }, // наприклад: dining, office
    names: {
      ua: { type: String, required: true },
      en: { type: String, required: true },
    },
    description: {
      ua: { type: String, default: "" },
      en: { type: String, default: "" },
    },
    image: { type: String, default: "" },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const categorySchema = new mongoose.Schema(
  {
    category: { type: String, required: true, unique: true, index: true }, // sofas
    names: {
      ua: { type: String, required: true },
      en: { type: String, required: true },
    },
    description: {
      ua: { type: String, default: "" },
      en: { type: String, default: "" },
    },
    image: { type: String, default: "" },
    order: { type: Number, default: 0 },

    // ✅ підкатегорії в цьому ж документі
    children: { type: [subCategorySchema], default: [] },

    // якщо ти реально зберігаєш folderPath
    folderPath: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("Category", categorySchema);
