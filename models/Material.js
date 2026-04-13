import mongoose from "mongoose";

const localizedTextSchema = new mongoose.Schema(
  {
    ua: { type: String, required: true, trim: true },
    en: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const materialSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    name: { type: localizedTextSchema, required: true },
    description: {
      ua: { type: String, default: "", trim: true },
      en: { type: String, default: "", trim: true },
    },
  },
  { timestamps: true }
);

export default mongoose.model("Material", materialSchema);
