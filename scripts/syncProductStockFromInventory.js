import mongoose from "mongoose";

import "../config/env.js";
import { env } from "../config/env.js";
import Product from "../models/Product.js";
import {
  findProductInventoryStockMismatches,
  syncProductsInventoryStock,
} from "../services/productStockSyncService.js";

const hasArg = (name) => process.argv.includes(name);
const dryRun = hasArg("--dry-run") || hasArg("--check");

const main = async () => {
  if (!env.mongoUri) {
    throw new Error("MONGO_URI is required");
  }

  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 15000 });

  const before = await findProductInventoryStockMismatches();
  if (!dryRun && before.length) {
    const productIds = await Product.find({})
      .select("_id")
      .lean()
      .then((items) => items.map((item) => item._id));
    await syncProductsInventoryStock(productIds);
  }
  const after = dryRun ? before : await findProductInventoryStockMismatches();

  console.log(
    JSON.stringify(
      {
        ok: after.length === 0,
        dryRun,
        mismatchesBefore: before.length,
        mismatchesAfter: after.length,
        fixed: dryRun ? 0 : Math.max(0, before.length - after.length),
        before: before.slice(0, 50),
        after: after.slice(0, 50),
      },
      null,
      2
    )
  );
};

main()
  .catch((error) => {
    console.error("Product stock sync failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => null);
  });
