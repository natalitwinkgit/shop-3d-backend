import mongoose from "mongoose";

import Inventory from "../models/Inventory.js";
import Product from "../models/Product.js";

const clamp0 = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const pickId = (value) => String(value?._id || value?.id || value || "").trim();

const toObjectId = (value) => {
  const id = pickId(value);
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
};

const emptyStockSummary = (productId = "") => ({
  productId: pickId(productId),
  rows: 0,
  onHand: 0,
  reserved: 0,
  available: 0,
  stockQty: 0,
  inStock: false,
});

export const summarizeInventoryRows = (rows = []) => {
  const summary = rows.reduce(
    (acc, row) => {
      const onHand = clamp0(row?.onHand);
      const reserved = clamp0(row?.reserved);
      const available = Math.max(0, onHand - reserved);

      acc.rows += 1;
      acc.onHand += onHand;
      acc.reserved += reserved;
      acc.available += available;
      return acc;
    },
    { rows: 0, onHand: 0, reserved: 0, available: 0 }
  );

  return {
    ...summary,
    stockQty: summary.available,
    inStock: summary.available > 0,
  };
};

export const loadProductInventoryStockMap = async (
  productIds = [],
  { onlyActiveLocations = true } = {}
) => {
  const ids = Array.from(
    new Map(
      productIds
        .map((id) => [pickId(id), toObjectId(id)])
        .filter(([key, objectId]) => key && objectId)
    ).entries()
  );

  const result = new Map(ids.map(([key]) => [key, emptyStockSummary(key)]));
  if (!ids.length) return result;

  const pipeline = [
    {
      $match: {
        product: { $in: ids.map(([, objectId]) => objectId) },
      },
    },
  ];

  if (onlyActiveLocations) {
    pipeline.push(
      {
        $lookup: {
          from: "locations",
          localField: "location",
          foreignField: "_id",
          as: "locationDoc",
        },
      },
      { $unwind: "$locationDoc" },
      { $match: { "locationDoc.isActive": { $ne: false } } }
    );
  }

  pipeline.push({
    $group: {
      _id: "$product",
      rows: { $sum: 1 },
      onHand: { $sum: { $max: [0, { $ifNull: ["$onHand", 0] }] } },
      reserved: { $sum: { $max: [0, { $ifNull: ["$reserved", 0] }] } },
      available: {
        $sum: {
          $max: [
            0,
            {
              $subtract: [
                { $max: [0, { $ifNull: ["$onHand", 0] }] },
                { $max: [0, { $ifNull: ["$reserved", 0] }] },
              ],
            },
          ],
        },
      },
    },
  });

  const rows = await Inventory.aggregate(pipeline);
  for (const row of rows) {
    const productId = pickId(row._id);
    const stockQty = clamp0(row.available);
    result.set(productId, {
      productId,
      rows: clamp0(row.rows),
      onHand: clamp0(row.onHand),
      reserved: clamp0(row.reserved),
      available: stockQty,
      stockQty,
      inStock: stockQty > 0,
    });
  }

  return result;
};

export const syncProductInventoryStock = async (
  productId,
  { onlyActiveLocations = true, requireInventoryRows = false } = {}
) => {
  const id = pickId(productId);
  const objectId = toObjectId(id);
  if (!objectId) {
    const error = new Error("productId is invalid");
    error.statusCode = 400;
    throw error;
  }

  const stockMap = await loadProductInventoryStockMap([id], { onlyActiveLocations });
  const summary = stockMap.get(id) || emptyStockSummary(id);

  if (requireInventoryRows && summary.rows <= 0) {
    return { ...summary, skipped: true, updated: false };
  }

  const updateResult = await Product.updateOne(
    { _id: objectId },
    {
      $set: {
        stockQty: summary.stockQty,
        inStock: summary.inStock,
      },
    }
  );

  return {
    ...summary,
    skipped: false,
    updated: updateResult.modifiedCount > 0,
    matched: updateResult.matchedCount > 0,
  };
};

export const syncProductsInventoryStock = async (
  productIds = [],
  { onlyActiveLocations = true, requireInventoryRows = false } = {}
) => {
  const ids = Array.from(new Set(productIds.map(pickId).filter(Boolean)));
  if (!ids.length) return [];

  const stockMap = await loadProductInventoryStockMap(ids, { onlyActiveLocations });
  const operations = [];
  const summaries = [];

  for (const id of ids) {
    const summary = stockMap.get(id) || emptyStockSummary(id);
    if (requireInventoryRows && summary.rows <= 0) {
      summaries.push({ ...summary, skipped: true, updated: false });
      continue;
    }

    summaries.push({ ...summary, skipped: false, updated: false });
    operations.push({
      updateOne: {
        filter: { _id: toObjectId(id) },
        update: {
          $set: {
            stockQty: summary.stockQty,
            inStock: summary.inStock,
          },
        },
      },
    });
  }

  if (operations.length) {
    await Product.bulkWrite(operations, { ordered: false });
  }

  return summaries;
};

export const findProductInventoryStockMismatches = async ({
  filter = {},
  onlyActiveLocations = true,
} = {}) => {
  const products = await Product.find(filter)
    .select("_id slug category subCategory stockQty inStock")
    .lean();
  const stockMap = await loadProductInventoryStockMap(
    products.map((product) => product._id),
    { onlyActiveLocations }
  );

  return products
    .map((product) => {
      const summary = stockMap.get(pickId(product._id)) || emptyStockSummary(product._id);
      return {
        productId: pickId(product._id),
        slug: product.slug || "",
        category: product.category || "",
        subCategory: product.subCategory || "",
        currentStockQty: clamp0(product.stockQty),
        expectedStockQty: summary.stockQty,
        currentInStock: !!product.inStock,
        expectedInStock: summary.inStock,
        inventoryRows: summary.rows,
      };
    })
    .filter(
      (item) =>
        item.currentStockQty !== item.expectedStockQty ||
        item.currentInStock !== item.expectedInStock
    );
};
