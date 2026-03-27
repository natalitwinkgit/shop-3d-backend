import mongoose from "mongoose";

const locationSchema = new mongoose.Schema({
  type: { type: String, enum: ['shop', 'showroom', 'office', 'warehouse'], required: true },
  city: { type: String, required: true }, // Технічна назва (напр. "Kyiv")
  nameKey: { type: String, required: true },
  addressKey: { type: String, required: true },
  coordinates: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  phone: { type: String },
  workingHours: {
    ua: { type: String },
    en: { type: String }
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const Location = mongoose.models.Location || mongoose.model("Location", locationSchema);
export default Location;
