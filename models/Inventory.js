import mongoose from "mongoose";

const InventorySchema = new mongoose.Schema(
  {
    product: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Product", 
      required: true, 
      index: true 
    },
    location: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Location", 
      required: true, 
      index: true 
    },
    onHand: { type: Number, default: 0, min: 0 },
    reserved: { type: Number, default: 0, min: 0 },
    zone: { type: String, default: "", trim: true },
    note: { type: String, default: "", trim: true },
    isShowcase: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

InventorySchema.index({ product: 1, location: 1 }, { unique: true });

// ВАЖЛИВО: Перевір цей рядок. Має бути export default
export default mongoose.model("Inventory", InventorySchema);
