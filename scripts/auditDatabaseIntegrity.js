import mongoose from "mongoose";

import "../config/env.js";
import { env } from "../config/env.js";
import Category from "../models/Category.js";
import Inventory from "../models/Inventory.js";
import Location from "../models/Location.js";
import Product from "../models/Product.js";
import SubCategory from "../models/SubCategory.js";
import { findProductInventoryStockMismatches } from "../services/productStockSyncService.js";

const pickStr = (value) => String(value || "").trim();

const main = async () => {
  if (!env.mongoUri) throw new Error("MONGO_URI is required");
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 15000 });

  const [products, categories, subcategories, inventories, locations, mismatchedStock] =
    await Promise.all([
      Product.find({}).select("_id slug category subCategory stockQty inStock status").lean(),
      Category.find({}).select("category children").lean(),
      SubCategory.find({}).select("categoryKey key isActive").lean(),
      Inventory.find({}).select("_id product location onHand reserved").lean(),
      Location.find({}).select("_id nameKey isActive").lean(),
      findProductInventoryStockMismatches(),
    ]);

  const productIds = new Set(products.map((product) => pickStr(product._id)));
  const locationIds = new Set(locations.map((location) => pickStr(location._id)));
  const categoryKeys = new Set(categories.map((category) => pickStr(category.category)).filter(Boolean));
  const embeddedSubcategoryKeys = new Set();

  for (const category of categories) {
    const categoryKey = pickStr(category.category);
    for (const child of category.children || []) {
      const childKey = pickStr(child.key);
      if (categoryKey && childKey) embeddedSubcategoryKeys.add(`${categoryKey}:${childKey}`);
    }
  }

  const flatSubcategoryKeys = new Set(
    subcategories
      .filter((item) => item.isActive !== false)
      .map((item) => `${pickStr(item.categoryKey)}:${pickStr(item.key)}`)
  );

  const invalidCategoryProducts = products.filter(
    (product) => !categoryKeys.has(pickStr(product.category))
  );
  const invalidSubcategoryProducts = products.filter((product) => {
    const subCategory = pickStr(product.subCategory);
    if (!subCategory) return false;
    const key = `${pickStr(product.category)}:${subCategory}`;
    return !embeddedSubcategoryKeys.has(key) && !flatSubcategoryKeys.has(key);
  });
  const reservedOverOnHand = inventories.filter(
    (row) => Number(row.reserved || 0) > Number(row.onHand || 0)
  );
  const orphanInventoryProducts = inventories.filter(
    (row) => !productIds.has(pickStr(row.product))
  );
  const orphanInventoryLocations = inventories.filter(
    (row) => !locationIds.has(pickStr(row.location))
  );

  const issues = {
    mismatchedStock: mismatchedStock.length,
    invalidCategoryProducts: invalidCategoryProducts.length,
    invalidSubcategoryProducts: invalidSubcategoryProducts.length,
    reservedOverOnHand: reservedOverOnHand.length,
    orphanInventoryProducts: orphanInventoryProducts.length,
    orphanInventoryLocations: orphanInventoryLocations.length,
  };

  console.log(
    JSON.stringify(
      {
        ok: Object.values(issues).every((count) => count === 0),
        counts: {
          products: products.length,
          categories: categories.length,
          subcategories: subcategories.length,
          inventories: inventories.length,
          locations: locations.length,
        },
        issues,
        samples: {
          mismatchedStock: mismatchedStock.slice(0, 20),
          invalidCategoryProducts: invalidCategoryProducts
            .slice(0, 20)
            .map((product) => ({ slug: product.slug, category: product.category })),
          invalidSubcategoryProducts: invalidSubcategoryProducts
            .slice(0, 20)
            .map((product) => ({
              slug: product.slug,
              category: product.category,
              subCategory: product.subCategory,
            })),
          reservedOverOnHand: reservedOverOnHand.slice(0, 20).map((row) => ({
            id: pickStr(row._id),
            product: pickStr(row.product),
            location: pickStr(row.location),
            onHand: row.onHand,
            reserved: row.reserved,
          })),
          orphanInventoryProducts: orphanInventoryProducts
            .slice(0, 20)
            .map((row) => ({ id: pickStr(row._id), product: pickStr(row.product) })),
          orphanInventoryLocations: orphanInventoryLocations
            .slice(0, 20)
            .map((row) => ({ id: pickStr(row._id), location: pickStr(row.location) })),
        },
      },
      null,
      2
    )
  );
};

main()
  .catch((error) => {
    console.error("Database integrity audit failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => null);
  });
