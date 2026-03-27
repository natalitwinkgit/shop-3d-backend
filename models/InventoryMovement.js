import mongoose from "mongoose";

const inventoryMovementSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["upsert", "transfer"],
      required: true,
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
      index: true,
    },
    fromLocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
      index: true,
    },
    toLocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
      index: true,
    },
    deltaOnHand: { type: Number, default: 0 },
    deltaReserved: { type: Number, default: 0 },
    previousOnHand: { type: Number, default: 0 },
    nextOnHand: { type: Number, default: 0 },
    previousReserved: { type: Number, default: 0 },
    nextReserved: { type: Number, default: 0 },
    quantity: { type: Number, default: 0 },
    zone: { type: String, default: "", trim: true },
    note: { type: String, default: "", trim: true },
    isShowcase: { type: Boolean, default: false },
    actorId: { type: String, default: "" },
    actorName: { type: String, default: "" },
    reason: { type: String, default: "", trim: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

inventoryMovementSchema.index({ createdAt: -1 });

export default
  mongoose.models.InventoryMovement ||
  mongoose.model("InventoryMovement", inventoryMovementSchema);
