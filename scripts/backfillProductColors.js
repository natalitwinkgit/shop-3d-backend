import dotenv from "dotenv";
import mongoose from "mongoose";
import Color from "../models/Color.js";
import Product from "../models/Product.js";
import {
  buildColorLookup,
  loadMergedProductColors,
  pickProductColor,
} from "./lib/productColorPalette.js";

dotenv.config();

const mongoUri =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.MONGO_URL ||
  process.env.DATABASE_URL;

if (!mongoUri) {
  throw new Error(
    "Missing MongoDB connection string. Set MONGO_URI, MONGODB_URI, MONGO_URL, or DATABASE_URL in .env."
  );
}

const arraysEqual = (left, right) => {
  if (!Array.isArray(left) && !Array.isArray(right)) return true;
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
};

const run = async () => {
  const palette = loadMergedProductColors();
  const colorLookup = buildColorLookup(palette);

  if (!palette.length) {
    throw new Error("Merged color palette is empty.");
  }

  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log(`Connected to MongoDB`);

  await Color.bulkWrite(
    palette.map((color) => ({
      updateOne: {
        filter: { key: color.key },
        update: { $set: color },
        upsert: true,
      },
    }))
  );
  console.log(`Upserted ${palette.length} colors`);

  const productsCollection = Product.collection;
  const products = await productsCollection
    .find({}, { projection: { _id: 1, slug: 1, name: 1, colorKeys: 1, rgb: 1 } })
    .toArray();
  console.log(`Found ${products.length} products`);

  let colorKeyUpdates = 0;
  let rgbRemovals = 0;
  const ops = [];

  products.forEach((product) => {
    const resolvedColor = pickProductColor({
      product,
      palette,
      colorLookup,
    });

    if (!resolvedColor.primaryColor) return;

    const nextUpdate = {};
    if (!arraysEqual(product.colorKeys, resolvedColor.colorKeys)) {
      nextUpdate.colorKeys = resolvedColor.colorKeys;
      colorKeyUpdates += 1;
    }

    const nextCommand = {};
    if (Object.keys(nextUpdate).length) {
      nextCommand.$set = nextUpdate;
    }
    if (Array.isArray(product.rgb) && product.rgb.length) {
      nextCommand.$unset = { rgb: "" };
      rgbRemovals += 1;
    }

    if (!Object.keys(nextCommand).length) return;

    ops.push({
      updateOne: {
        filter: { _id: product._id },
        update: nextCommand,
      },
    });
  });

  if (ops.length) {
    await productsCollection.bulkWrite(ops);
  }

  console.log(
    `Updated ${ops.length} products (${colorKeyUpdates} colorKeys changes, ${rgbRemovals} rgb removals)`
  );
  const remainingRgbDocs = await productsCollection.countDocuments({ rgb: { $exists: true } });
  console.log(`Products with rgb still present: ${remainingRgbDocs}`);
  await mongoose.disconnect();
  console.log("Disconnected from MongoDB");
};

run().catch(async (error) => {
  console.error("Product color backfill failed", error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors after a failed connection
  }
  process.exit(1);
});
