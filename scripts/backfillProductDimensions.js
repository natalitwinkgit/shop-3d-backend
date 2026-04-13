import dotenv from "dotenv";
import mongoose from "mongoose";

import Product from "../models/Product.js";

dotenv.config();

const DIMENSION_KEYS = ["widthCm", "depthCm", "heightCm", "lengthCm", "diameterCm"];

const pickDimensions = (product = {}) => {
  const specs =
    product?.specifications && typeof product.specifications === "object"
      ? product.specifications
      : {};
  const current =
    product?.dimensions && typeof product.dimensions === "object" ? product.dimensions : {};

  const dimensions = DIMENSION_KEYS.reduce((acc, key) => {
    const value = current[key] ?? specs[key];
    if (Number.isFinite(value)) acc[key] = value;
    return acc;
  }, {});

  const lengthFallback = current.lengthCm ?? specs.lengthCm ?? current.depthCm ?? specs.depthCm;
  if (!Number.isFinite(dimensions.lengthCm) && Number.isFinite(lengthFallback)) {
    dimensions.lengthCm = lengthFallback;
  }

  return dimensions;
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  try {
    const products = await Product.find({}).select("_id dimensions specifications").lean();
    let updated = 0;

    for (const product of products) {
      const dimensions = pickDimensions(product);
      if (!Object.keys(dimensions).length) continue;

      await Product.updateOne(
        { _id: product._id },
        {
          $set: {
            dimensions,
            specifications: {
              ...(product.specifications || {}),
              ...dimensions,
            },
          },
        }
      );

      updated += 1;
    }

    console.log(`Backfilled product dimensions for ${updated} products.`);
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((error) => {
  console.error("Failed to backfill product dimensions:", error);
  process.exit(1);
});
