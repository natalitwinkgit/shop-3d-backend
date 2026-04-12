import dotenv from "dotenv";
import mongoose from "mongoose";

import Product from "../models/Product.js";
import {
  buildProductSku,
  buildProductSlug,
  buildProductTypeKey,
  ensureUniqueIdentityValue,
} from "../services/productIdentityService.js";

dotenv.config();

if (!process.env.MONGO_URI) {
  throw new Error("MONGO_URI is required in .env");
}

const trimString = (value) => String(value || "").trim();

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  const products = await Product.find({})
    .select("_id name sku slug category subCategory typeKey")
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  const usedSlugs = new Set(
    products.map((product) => trimString(product.slug)).filter(Boolean)
  );
  const usedSkus = new Set();
  const planned = [];

  for (const product of products) {
    const currentSlug = trimString(product.slug);
    if (currentSlug) {
      usedSlugs.delete(currentSlug);
    }

    const slugBase =
      currentSlug ||
      buildProductSlug({
        name: product.name,
        fallbackSlug: `${product.category}-${product.subCategory}`,
      });

    const nextSlug = ensureUniqueIdentityValue(slugBase, usedSlugs);
    const nextTypeKey = buildProductTypeKey({
      category: product.category,
      subCategory: product.subCategory,
      fallbackTypeKey: product.typeKey,
    });

    const currentSku = trimString(product.sku);
    if (currentSku) {
      usedSkus.delete(currentSku);
    }

    const skuBase = buildProductSku({
      category: product.category,
      subCategory: product.subCategory,
      slug: nextSlug,
      name: product.name,
      fallbackSku: currentSku,
    });
    const nextSku = ensureUniqueIdentityValue(skuBase, usedSkus);

    planned.push({
      _id: product._id,
      slug: nextSlug,
      typeKey: nextTypeKey,
      sku: nextSku,
      changed:
        currentSlug !== nextSlug ||
        trimString(product.typeKey) !== nextTypeKey ||
        currentSku !== nextSku,
    });
  }

  const changedItems = planned.filter((item) => item.changed);

  if (changedItems.length) {
    await Product.bulkWrite(
      changedItems.map((item) => ({
        updateOne: {
          filter: { _id: item._id },
          update: {
            $set: {
              slug: item.slug,
              typeKey: item.typeKey,
              sku: item.sku,
            },
          },
        },
      }))
    );
  }

  const sample = await Product.find({})
    .select("name sku slug category subCategory typeKey")
    .sort({ updatedAt: -1 })
    .limit(10)
    .lean();

  console.log(
    JSON.stringify(
      {
        totalProducts: products.length,
        updatedProducts: changedItems.length,
        sample,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Backfill product identity failed", error);
  try {
    await mongoose.disconnect();
  } catch {
    // no-op
  }
  process.exit(1);
});
