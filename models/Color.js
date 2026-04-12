import mongoose from "mongoose";

const ColorSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    name: {
      ua: { type: String, required: true },
      en: { type: String, required: true },
    },
    hex: { type: String, required: true, trim: true, uppercase: true },
    rgb: {
      type: [Number],
      required: true,
      validate: {
        validator: (value) => Array.isArray(value) && value.length === 3 && value.every((v) => Number.isInteger(v) && v >= 0 && v <= 255),
        message: "rgb must be an array of three integers between 0 and 255",
      },
    },
    slug: { type: String, default: null, trim: true },
    group: { type: String, default: null, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Color", ColorSchema);
