import mongoose from "mongoose";

const SpecFieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true }, // "mechanismKey"
    label: {
      ua: { type: String, required: true },
      en: { type: String, required: true },
    },

    // Як показувати/редагувати
    kind: {
      type: String,
      required: true,
      enum: ["text", "number", "bool", "dict", "chips_dict", "dimensions", "availability", "color"],
    },

    // Куди зберігати/звідки читати в Product (dot-path або top-level)
    // приклади: "specifications.mechanismKey", "colorKeys", "styleKeys"
    path: { type: String, required: true },

    unit: { type: String, default: null },   // "см", "кг", "міс."
    dict: { type: String, default: null },   // "materials", "mechanisms", ...
    required: { type: Boolean, default: false },
    sort: { type: Number, default: 100 },
    isActive: { type: Boolean, default: true },

    // опційно: контроль доступності поля по typeKey
    allowedTypeKeys: { type: [String], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("SpecField", SpecFieldSchema);
