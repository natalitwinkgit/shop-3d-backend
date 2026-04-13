import mongoose from "mongoose";

import "../config/env.js";
import Inventory from "../models/Inventory.js";

const applyChanges = process.argv.includes("--apply");

const run = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not configured");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const orphanRows = await Inventory.aggregate([
    {
      $lookup: {
        from: "products",
        localField: "product",
        foreignField: "_id",
        as: "productDoc",
      },
    },
    {
      $lookup: {
        from: "locations",
        localField: "location",
        foreignField: "_id",
        as: "locationDoc",
      },
    },
    {
      $addFields: {
        missingProduct: { $eq: [{ $size: "$productDoc" }, 0] },
        missingLocation: { $eq: [{ $size: "$locationDoc" }, 0] },
      },
    },
    {
      $match: {
        $or: [{ missingProduct: true }, { missingLocation: true }],
      },
    },
    {
      $project: {
        _id: 1,
        product: 1,
        location: 1,
        missingProduct: 1,
        missingLocation: 1,
      },
    },
  ]);

  const summary = {
    totalOrphans: orphanRows.length,
    missingProduct: orphanRows.filter((row) => row.missingProduct).length,
    missingLocation: orphanRows.filter((row) => row.missingLocation).length,
    sample: orphanRows.slice(0, 10),
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!applyChanges || !orphanRows.length) {
    return;
  }

  const ids = orphanRows.map((row) => row._id);
  const result = await Inventory.deleteMany({ _id: { $in: ids } });

  console.log(
    JSON.stringify(
      {
        deletedCount: Number(result.deletedCount || 0),
      },
      null,
      2
    )
  );
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch {
      // ignore disconnect errors on shutdown
    }
  });
