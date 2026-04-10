// server/models/Product.js
import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: { ua: { type: String, required: true }, en: { type: String, required: true } },
    description: { ua: { type: String, default: "" }, en: { type: String, default: "" } },

    slug: { type: String, required: true, unique: true, index: true },
    category: { type: String, required: true, index: true },
    subCategory: { type: String, default: null, index: true },
    typeKey: { type: String, index: true },

    images: { type: [String], default: [] },
    previewImage: { type: String, default: "" },
    modelUrl: { type: String, default: "" },

    styleKeys: { type: [String], default: [], index: true },
    colorKeys: { type: [String], default: [], index: true },
    roomKeys: { type: [String], default: [] },
    collectionKeys: { type: [String], default: [] },
    featureKeys: { type: [String], default: [] },

    // ✅ ДИНАМІЧНІ характеристики:
    specifications: { type: mongoose.Schema.Types.Mixed, default: {} },

    price: { type: Number, required: true, min: 0, index: true },
    discount: { type: Number, default: 0, min: 0, max: 100 },

    inStock: { type: Boolean, default: true, index: true },
    stockQty: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "archived"], default: "active" },

    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("Product", productSchema);
