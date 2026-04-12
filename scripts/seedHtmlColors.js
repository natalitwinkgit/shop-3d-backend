import dotenv from "dotenv";
import mongoose from "mongoose";
import Color from "../models/Color.js";
import {
  loadMergedProductColors,
  productColorPaletteSources,
} from "./lib/productColorPalette.js";

dotenv.config();

const mongoUri =
  process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGO_URL || process.env.DATABASE_URL;

if (!mongoUri) {
  throw new Error(
    "Missing MongoDB connection string. Set MONGO_URI, MONGODB_URI, MONGO_URL, or DATABASE_URL in .env."
  );
}

const run = async () => {
  await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
  const colors = loadMergedProductColors();
  console.log(
    `Read ${colors.length} colors from ${productColorPaletteSources.htmlColorsPath} + ${productColorPaletteSources.productColorOverridesPath}`
  );

  if (colors.length) {
    await Color.bulkWrite(
      colors.map((color) => ({
        updateOne: {
          filter: { key: color.key },
          update: { $set: color },
          upsert: true,
        },
      }))
    );
  }

  console.log(`Seeded ${colors.length} colors into MongoDB`);
  await mongoose.disconnect();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
