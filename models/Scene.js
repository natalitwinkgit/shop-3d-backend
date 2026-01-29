import mongoose from "mongoose";

const sceneSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, default: "Мій дизайн інтер'єру" },
  roomConfig: {
    width: { type: Number, default: 400 }, // см
    height: { type: Number, default: 250 },
    depth: { type: Number, default: 400 }
  },
  // Масив меблів на сцені
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    position: { x: Number, y: Number, z: Number },
    rotation: { x: Number, y: Number, z: Number },
  }]
}, { timestamps: true });

export default mongoose.model("Scene", sceneSchema);