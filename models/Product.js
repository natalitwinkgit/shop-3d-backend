// server/models/Product.js
import mongoose from "mongoose";

const ProductDimensionsSchema = new mongoose.Schema(
  {
    widthCm: { type: Number, min: 0, default: null },
    depthCm: { type: Number, min: 0, default: null },
    heightCm: { type: Number, min: 0, default: null },
    lengthCm: { type: Number, min: 0, default: null },
    diameterCm: { type: Number, min: 0, default: null },
  },
  { _id: false }
);

const ProductSpecificationsSchema = new mongoose.Schema(
  {
    material: { type: mongoose.Schema.Types.ObjectId, ref: "Material", default: null },
    manufacturer: { type: mongoose.Schema.Types.ObjectId, ref: "Manufacturer", default: null },
  },
  { _id: false, strict: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { ua: { type: String, required: true }, en: { type: String, required: true } },
    description: { ua: { type: String, default: "" }, en: { type: String, default: "" } },

    sku: { type: String, default: "", trim: true, index: true },
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

    // Стандартизовані габарити для меблів та інших фізичних товарів.
    dimensions: { type: ProductDimensionsSchema, default: () => ({}) },

    // Динамічні професійні характеристики залежно від typeKey:
    // sofa -> seats, sleepingArea, mechanismKey
    // lighting -> bulbBase, wattage, lightTemperatureK, ipRating
    // wardrobe -> doorCount, shelfCount
    specifications: { type: ProductSpecificationsSchema, default: () => ({}) },

    price: { type: Number, required: true, min: 0, index: true },
    discount: { type: Number, default: 0, min: 0, max: 100 },

    inStock: { type: Boolean, default: true, index: true },
    stockQty: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "draft", "archived"], default: "active" },

    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("Product", productSchema);
