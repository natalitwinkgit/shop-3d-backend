import dotenv from "dotenv";
import mongoose from "mongoose";

import Manufacturer from "../models/Manufacturer.js";
import Material from "../models/Material.js";
import Product from "../models/Product.js";

dotenv.config();

const MATERIAL_LABELS = {
  textile: { ua: "Текстиль", en: "Textile" },
  velour: { ua: "Велюр", en: "Velour" },
  wood: { ua: "Дерево", en: "Wood" },
  mdf: { ua: "МДФ", en: "MDF" },
  metal: { ua: "Метал", en: "Metal" },
  stone: { ua: "Камінь", en: "Stone" },
};

const MANUFACTURER_LABELS = {
  soft_form: { name: "Soft Form", country: "Ukraine" },
  comfort_lab: { name: "Comfort Lab", country: "Ukraine" },
  woodline: { name: "Woodline", country: "Ukraine" },
  light_house: { name: "Light House", country: "Ukraine" },
};

const normalizeKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const titleFromKey = (key) =>
  key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const collectProductReferences = (products = []) => {
  const materialKeys = new Set();
  const manufacturerKeys = new Set();

  products.forEach((product) => {
    const specifications = product.specifications || {};
    if (specifications.materialKey) materialKeys.add(normalizeKey(specifications.materialKey));
    if (Array.isArray(specifications.materialKeys)) {
      specifications.materialKeys.forEach((key) => materialKeys.add(normalizeKey(key)));
    }
    if (Array.isArray(specifications.materials)) {
      specifications.materials.forEach((item) => {
        if (typeof item === "string") materialKeys.add(normalizeKey(item));
        if (item?.key) materialKeys.add(normalizeKey(item.key));
      });
    }
    if (specifications.manufacturerKey) {
      manufacturerKeys.add(normalizeKey(specifications.manufacturerKey));
    }
  });

  return {
    materialKeys: Array.from(materialKeys).filter(Boolean),
    manufacturerKeys: Array.from(manufacturerKeys).filter(Boolean),
  };
};

const upsertMaterials = async (keys) => {
  await Promise.all(
    keys.map((key) => {
      const label = MATERIAL_LABELS[key] || { ua: titleFromKey(key), en: titleFromKey(key) };
      return Material.updateOne(
        { key },
        {
          $setOnInsert: {
            key,
            name: label,
            description: { ua: "", en: "" },
          },
        },
        { upsert: true }
      );
    })
  );

  const materials = await Material.find({ key: { $in: keys } }).lean();
  return new Map(materials.map((item) => [normalizeKey(item.key), item]));
};

const upsertManufacturers = async (keys) => {
  await Promise.all(
    keys.map((key) => {
      const label = MANUFACTURER_LABELS[key] || { name: titleFromKey(key), country: "" };
      return Manufacturer.updateOne(
        { key },
        {
          $setOnInsert: {
            key,
            name: label.name,
            country: label.country,
            website: "",
          },
        },
        { upsert: true }
      );
    })
  );

  const manufacturers = await Manufacturer.find({ key: { $in: keys } }).lean();
  return new Map(manufacturers.map((item) => [normalizeKey(item.key), item]));
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  try {
    const products = await Product.find({}).select("_id specifications").lean();
    const { materialKeys, manufacturerKeys } = collectProductReferences(products);
    const [materialByKey, manufacturerByKey] = await Promise.all([
      upsertMaterials(materialKeys),
      upsertManufacturers(manufacturerKeys),
    ]);

    let updated = 0;
    for (const product of products) {
      const specifications = product.specifications || {};
      const materialKey = normalizeKey(specifications.materialKey || specifications.materialKeys?.[0]);
      const manufacturerKey = normalizeKey(specifications.manufacturerKey);
      const material = materialByKey.get(materialKey);
      const manufacturer = manufacturerByKey.get(manufacturerKey);
      const $set = {};

      if (material) $set["specifications.material"] = material._id;
      if (manufacturer) $set["specifications.manufacturer"] = manufacturer._id;
      if (!Object.keys($set).length) continue;

      await Product.updateOne({ _id: product._id }, { $set });
      updated += 1;
    }

    console.log(
      `Backfilled ${materialKeys.length} materials, ${manufacturerKeys.length} manufacturers and ${updated} products.`
    );
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((error) => {
  console.error("Failed to backfill product references:", error);
  process.exit(1);
});
