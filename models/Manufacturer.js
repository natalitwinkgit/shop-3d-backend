import mongoose from "mongoose";

const manufacturerSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    name: { type: String, required: true, trim: true },
    country: { type: String, default: "", trim: true },
    website: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

export default mongoose.model("Manufacturer", manufacturerSchema);
