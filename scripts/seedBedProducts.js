import mongoose from "mongoose";

import "../config/env.js";
import Category from "../models/Category.js";
import Inventory from "../models/Inventory.js";
import InventoryMovement from "../models/InventoryMovement.js";
import Location from "../models/Location.js";
import Manufacturer from "../models/Manufacturer.js";
import Material from "../models/Material.js";
import Product from "../models/Product.js";
import SubCategory from "../models/SubCategory.js";
import {
  buildProductSku,
  buildProductSlug,
  buildProductTypeKey,
} from "../services/productIdentityService.js";

const SEED_TAG = "beds-catalog-v1";
const CATEGORY_KEY = "beds";

const daysAgo = (days, hour = 10) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date;
};

const placeholderImage = (label) =>
  `https://placehold.co/1200x900/e8edf2/1f2937?text=${encodeURIComponent(label)}`;

const buildModelUrl = (slug) =>
  `https://res.cloudinary.com/demo-furniture-catalog/raw/upload/v1/products/models/${encodeURIComponent(slug)}.glb`;

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const materialDefs = [
  {
    key: "solid_oak",
    name: { ua: "Масив дуба", en: "Solid oak" },
  },
  {
    key: "ash_wood",
    name: { ua: "Масив ясеня", en: "Ash wood" },
  },
  {
    key: "birch_plywood",
    name: { ua: "Березова фанера", en: "Birch plywood" },
  },
  {
    key: "velvet_premium",
    name: { ua: "Велюр преміум", en: "Premium velvet" },
  },
  {
    key: "chenille_soft",
    name: { ua: "Шеніл", en: "Soft chenille" },
  },
  {
    key: "textile_rogozhka",
    name: { ua: "Рогожка", en: "Basket weave textile" },
  },
  {
    key: "eco_leather_nappa",
    name: { ua: "Екошкіра Наппа", en: "Nappa eco leather" },
  },
  {
    key: "chipboard_laminated",
    name: { ua: "ЛДСП", en: "Laminated chipboard" },
  },
];

const manufacturerDefs = [
  { key: "nordic_rest", name: "Nordic Rest", country: "Ukraine" },
  { key: "eco_sleep", name: "Eco Sleep", country: "Ukraine" },
  { key: "smart_nursery", name: "Smart Nursery", country: "Ukraine" },
  { key: "soft_form", name: "Soft Form", country: "Ukraine" },
  { key: "woodline", name: "Woodline", country: "Ukraine" },
  { key: "solid_base", name: "Solid Base", country: "Ukraine" },
  { key: "comfort_lab", name: "Comfort Lab", country: "Ukraine" },
  { key: "heritage_craft", name: "Heritage Craft", country: "Ukraine" },
];

const subCategoryDefs = [
  { key: "single", name: { ua: "Односпальні", en: "Single beds" } },
  { key: "double", name: { ua: "Двоспальні", en: "Double beds" } },
  { key: "queen", name: { ua: "Полуторні", en: "Queen beds" } },
  { key: "king", name: { ua: "King-size", en: "King-size beds" } },
  { key: "kids", name: { ua: "Дитячі", en: "Kids beds" } },
  { key: "bunk", name: { ua: "Двоярусні", en: "Bunk beds" } },
  { key: "storage", name: { ua: "З підйомним механізмом", en: "Storage beds" } },
  { key: "upholstered", name: { ua: "М'які ліжка", en: "Upholstered beds" } },
];

const bedDefs = [
  {
    name: { ua: "Ліжко Nordic Oak Single", en: "Nordic Oak Single Bed" },
    subCategory: "single",
    price: 18400,
    discount: 5,
    materialKeys: ["solid_oak", "birch_plywood"],
    manufacturerKey: "nordic_rest",
    colorKeys: ["oak", "natural", "cream"],
    styleKeys: ["scandinavian", "minimal"],
    collectionKeys: ["nordic_bedroom"],
    featureKeys: ["orthopedic-base", "solid-frame", "compact"],
    dimensions: { widthCm: 102, depthCm: 212, heightCm: 92, lengthCm: 212 },
    specifications: {
      mattressSizeCm: "90x200",
      sleepingAreaCm: "90x200",
      frameMaterial: "solid_oak",
      baseType: "wooden_lamella",
      headboardType: "low_panel",
      maxLoadKg: 140,
      storageBox: false,
      liftMechanism: false,
      assemblyRequired: true,
      packageCount: 2,
      warrantyMonths: 24,
      leadTimeDays: 4,
    },
    inventory: [
      { nameKey: "wh_kyiv_main", onHand: 8, reserved: 1, zone: "BED-A1" },
      { nameKey: "shop_kyiv_center", onHand: 2, reserved: 0, zone: "SHOW", isShowcase: true },
      { nameKey: "wh_lviv_hub", onHand: 5, reserved: 1, zone: "BED-L1" },
    ],
  },
  {
    name: { ua: "Ліжко Soft Cloud Double", en: "Soft Cloud Double Bed" },
    subCategory: "double",
    price: 29900,
    discount: 8,
    materialKeys: ["chenille_soft", "birch_plywood"],
    manufacturerKey: "soft_form",
    colorKeys: ["stone", "light-gray", "warm-white"],
    styleKeys: ["contemporary", "soft"],
    collectionKeys: ["cloud_sleep"],
    featureKeys: ["soft-headboard", "orthopedic-base", "anti-scratch-fabric"],
    dimensions: { widthCm: 174, depthCm: 224, heightCm: 108, lengthCm: 224 },
    specifications: {
      mattressSizeCm: "160x200",
      sleepingAreaCm: "160x200",
      upholstery: "chenille_soft",
      frameMaterial: "birch_plywood",
      baseType: "metal_lamella",
      headboardType: "high_soft",
      maxLoadKg: 240,
      storageBox: false,
      liftMechanism: false,
      assemblyRequired: true,
      packageCount: 3,
      warrantyMonths: 24,
      leadTimeDays: 6,
    },
    inventory: [
      { nameKey: "wh_kyiv_main", onHand: 6, reserved: 1, zone: "BED-A2" },
      { nameKey: "shop_lviv_viktoria", onHand: 2, reserved: 0, zone: "SHOW", isShowcase: true },
      { nameKey: "wh_odesa_port", onHand: 4, reserved: 0, zone: "BED-O1" },
    ],
  },
  {
    name: { ua: "Ліжко Mila Queen", en: "Mila Queen Bed" },
    subCategory: "queen",
    price: 26400,
    discount: 6,
    materialKeys: ["textile_rogozhka", "chipboard_laminated"],
    manufacturerKey: "comfort_lab",
    colorKeys: ["latte", "beige", "walnut"],
    styleKeys: ["modern", "warm"],
    collectionKeys: ["mila_bedroom"],
    featureKeys: ["easy-clean", "soft-headboard", "compact-storage"],
    dimensions: { widthCm: 154, depthCm: 214, heightCm: 104, lengthCm: 214 },
    specifications: {
      mattressSizeCm: "140x200",
      sleepingAreaCm: "140x200",
      upholstery: "textile_rogozhka",
      frameMaterial: "chipboard_laminated",
      baseType: "wooden_lamella",
      headboardType: "soft_panel",
      maxLoadKg: 210,
      storageBox: true,
      liftMechanism: "gas_lift",
      assemblyRequired: true,
      packageCount: 3,
      warrantyMonths: 24,
      leadTimeDays: 5,
    },
    inventory: [
      { nameKey: "wh_lviv_hub", onHand: 7, reserved: 2, zone: "BED-L2" },
      { nameKey: "shop_kyiv_left", onHand: 1, reserved: 0, zone: "SHOW", isShowcase: true },
      { nameKey: "wh_kharkiv_logistics", onHand: 5, reserved: 1, zone: "BED-KH1" },
    ],
  },
  {
    name: { ua: "Ліжко Terra King Platform", en: "Terra King Platform Bed" },
    subCategory: "king",
    price: 42100,
    discount: 10,
    materialKeys: ["ash_wood", "solid_oak"],
    manufacturerKey: "heritage_craft",
    colorKeys: ["walnut", "dark-oak", "graphite"],
    styleKeys: ["premium", "natural"],
    collectionKeys: ["terra_suite"],
    featureKeys: ["platform-base", "solid-frame", "premium-finish"],
    dimensions: { widthCm: 204, depthCm: 226, heightCm: 96, lengthCm: 226 },
    specifications: {
      mattressSizeCm: "180x200",
      sleepingAreaCm: "180x200",
      frameMaterial: "ash_wood",
      baseType: "platform",
      headboardType: "wood_panel",
      maxLoadKg: 300,
      storageBox: false,
      liftMechanism: false,
      assemblyRequired: true,
      packageCount: 4,
      warrantyMonths: 36,
      leadTimeDays: 8,
    },
    inventory: [
      { nameKey: "wh_kyiv_main", onHand: 3, reserved: 1, zone: "BED-P1" },
      { nameKey: "shop_odesa_sea", onHand: 1, reserved: 0, zone: "SHOW", isShowcase: true },
      { nameKey: "wh_lviv_hub", onHand: 2, reserved: 0, zone: "BED-P2" },
    ],
  },
  {
    name: { ua: "Дитяче ліжко Smart House", en: "Smart House Kids Bed" },
    subCategory: "kids",
    price: 23500,
    discount: 4,
    materialKeys: ["birch_plywood", "mdf_painted"],
    manufacturerKey: "smart_nursery",
    colorKeys: ["white", "mint", "natural"],
    styleKeys: ["kids", "playful"],
    collectionKeys: ["smart_kids"],
    featureKeys: ["safety-rail", "rounded-corners", "kids-safe-paint"],
    dimensions: { widthCm: 104, depthCm: 208, heightCm: 156, lengthCm: 208 },
    specifications: {
      mattressSizeCm: "90x200",
      sleepingAreaCm: "90x200",
      frameMaterial: "birch_plywood",
      baseType: "wooden_lamella",
      headboardType: "house_frame",
      maxLoadKg: 120,
      storageBox: false,
      safetyRail: true,
      recommendedAge: "3+",
      assemblyRequired: true,
      packageCount: 3,
      warrantyMonths: 24,
      leadTimeDays: 7,
    },
    inventory: [
      { nameKey: "wh_kyiv_main", onHand: 5, reserved: 1, zone: "KIDS-A1" },
      { nameKey: "shop_if_center", onHand: 2, reserved: 0, zone: "SHOW", isShowcase: true },
      { nameKey: "wh_mykolaiv_south", onHand: 3, reserved: 0, zone: "KIDS-M1" },
    ],
  },
  {
    name: { ua: "Двоярусне ліжко Loft Duo", en: "Loft Duo Bunk Bed" },
    subCategory: "bunk",
    price: 31800,
    discount: 7,
    materialKeys: ["solid_oak", "birch_plywood"],
    manufacturerKey: "solid_base",
    colorKeys: ["oak", "white", "sand"],
    styleKeys: ["family", "functional"],
    collectionKeys: ["loft_kids"],
    featureKeys: ["ladder", "safety-rail", "space-saving"],
    dimensions: { widthCm: 108, depthCm: 214, heightCm: 174, lengthCm: 214 },
    specifications: {
      mattressSizeCm: "90x200 + 90x200",
      sleepingAreaCm: "90x200",
      frameMaterial: "solid_oak",
      baseType: "wooden_lamella",
      headboardType: "safety_panel",
      maxLoadKg: 220,
      storageBox: false,
      safetyRail: true,
      ladderSide: "universal",
      assemblyRequired: true,
      packageCount: 4,
      warrantyMonths: 24,
      leadTimeDays: 9,
    },
    inventory: [
      { nameKey: "wh_lviv_hub", onHand: 4, reserved: 1, zone: "BUNK-L1" },
      { nameKey: "shop_dnipro_mall", onHand: 1, reserved: 0, zone: "SHOW", isShowcase: true },
      { nameKey: "wh_kyiv_main", onHand: 4, reserved: 0, zone: "BUNK-K1" },
    ],
  },
  {
    name: { ua: "Ліжко Aurora Lift Storage", en: "Aurora Lift Storage Bed" },
    subCategory: "storage",
    price: 34700,
    discount: 9,
    materialKeys: ["eco_leather_nappa", "chipboard_laminated"],
    manufacturerKey: "eco_sleep",
    colorKeys: ["ivory", "taupe", "black"],
    styleKeys: ["modern", "practical"],
    collectionKeys: ["aurora_storage"],
    featureKeys: ["gas-lift", "large-storage", "easy-clean"],
    dimensions: { widthCm: 174, depthCm: 218, heightCm: 112, lengthCm: 218 },
    specifications: {
      mattressSizeCm: "160x200",
      sleepingAreaCm: "160x200",
      upholstery: "eco_leather_nappa",
      frameMaterial: "chipboard_laminated",
      baseType: "metal_lamella",
      headboardType: "soft_panel",
      maxLoadKg: 250,
      storageBox: true,
      storageVolumeL: 620,
      liftMechanism: "gas_lift",
      assemblyRequired: true,
      packageCount: 4,
      warrantyMonths: 24,
      leadTimeDays: 6,
    },
    inventory: [
      { nameKey: "wh_kyiv_main", onHand: 7, reserved: 2, zone: "LIFT-K1" },
      { nameKey: "shop_kharkiv_nikolsky", onHand: 1, reserved: 0, zone: "SHOW", isShowcase: true },
      { nameKey: "wh_odesa_port", onHand: 5, reserved: 1, zone: "LIFT-O1" },
    ],
  },
  {
    name: { ua: "Ліжко Velvet Haven", en: "Velvet Haven Upholstered Bed" },
    subCategory: "upholstered",
    price: 38600,
    discount: 11,
    materialKeys: ["velvet_premium", "birch_plywood"],
    manufacturerKey: "soft_form",
    colorKeys: ["dusty-rose", "deep-blue", "cream"],
    styleKeys: ["hotel", "premium"],
    collectionKeys: ["haven_suite"],
    featureKeys: ["tall-headboard", "premium-upholstery", "orthopedic-base"],
    dimensions: { widthCm: 186, depthCm: 230, heightCm: 128, lengthCm: 230 },
    specifications: {
      mattressSizeCm: "180x200",
      sleepingAreaCm: "180x200",
      upholstery: "velvet_premium",
      frameMaterial: "birch_plywood",
      baseType: "metal_lamella",
      headboardType: "tall_soft",
      maxLoadKg: 280,
      storageBox: false,
      liftMechanism: false,
      assemblyRequired: true,
      packageCount: 4,
      warrantyMonths: 36,
      leadTimeDays: 8,
    },
    inventory: [
      { nameKey: "wh_lviv_hub", onHand: 4, reserved: 0, zone: "VEL-L1" },
      { nameKey: "shop_kyiv_center", onHand: 1, reserved: 0, zone: "SHOW", isShowcase: true },
      { nameKey: "wh_if_west", onHand: 3, reserved: 1, zone: "VEL-I1" },
    ],
  },
];

const pickStr = (value) => String(value || "").trim();

const ensureMongo = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGO_URL || process.env.DATABASE_URL;
  if (!uri) throw new Error("MONGO_URI is required");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
};

const ensureCategoryTree = async () => {
  const category = await Category.findOneAndUpdate(
    { category: CATEGORY_KEY },
    {
      $setOnInsert: {
        category: CATEGORY_KEY,
        names: { ua: "Ліжка", en: "Beds" },
        description: {
          ua: "Ліжка для спальні, дитячої та гостьової кімнати.",
          en: "Beds for bedrooms, kids rooms and guest spaces.",
        },
        image: placeholderImage("Beds category"),
        order: 1,
        folderPath: "beds",
      },
    },
    { new: true, upsert: true }
  );

  const existingChildren = new Map((category.children || []).map((child) => [child.key, child]));
  const nextChildren = [...(category.children || [])];

  subCategoryDefs.forEach((child, index) => {
    if (!existingChildren.has(child.key)) {
      nextChildren.push({
        key: child.key,
        names: child.name,
        description: { ua: "", en: "" },
        image: placeholderImage(`Beds ${child.name.en}`),
        order: index + 1,
      });
    }
  });

  await Category.updateOne({ category: CATEGORY_KEY }, { $set: { children: nextChildren } });

  await Promise.all(
    subCategoryDefs.map((child, index) =>
      SubCategory.updateOne(
        { categoryKey: CATEGORY_KEY, key: child.key },
        {
          $set: {
            name: child.name,
            isActive: true,
            sort: index + 1,
          },
          $setOnInsert: {
            categoryKey: CATEGORY_KEY,
            key: child.key,
            description: { ua: "", en: "" },
          },
        },
        { upsert: true }
      )
    )
  );
};

const ensureReferences = async () => {
  await Promise.all([
    ...materialDefs.map((material) =>
      Material.updateOne(
        { key: material.key },
        {
          $setOnInsert: {
            key: material.key,
            name: material.name,
            description: { ua: "", en: "" },
          },
        },
        { upsert: true }
      )
    ),
    ...manufacturerDefs.map((manufacturer) =>
      Manufacturer.updateOne(
        { key: manufacturer.key },
        {
          $setOnInsert: {
            key: manufacturer.key,
            name: manufacturer.name,
            country: manufacturer.country,
            website: "",
          },
        },
        { upsert: true }
      )
    ),
  ]);

  const [materials, manufacturers] = await Promise.all([
    Material.find({ key: { $in: materialDefs.map((item) => item.key) } }).lean(),
    Manufacturer.find({ key: { $in: manufacturerDefs.map((item) => item.key) } }).lean(),
  ]);

  return {
    materialsByKey: new Map(materials.map((item) => [item.key, item])),
    manufacturersByKey: new Map(manufacturers.map((item) => [item.key, item])),
  };
};

const loadLocations = async () => {
  const locations = await Location.find({ isActive: true }).lean();
  const byNameKey = new Map(locations.map((location) => [location.nameKey, location]));
  const missing = new Set();

  bedDefs.forEach((product) => {
    product.inventory.forEach((row) => {
      if (!byNameKey.has(row.nameKey)) missing.add(row.nameKey);
    });
  });

  if (missing.size) {
    throw new Error(`Missing active inventory locations: ${[...missing].join(", ")}`);
  }

  return byNameKey;
};

const buildProductDoc = ({ product, materialsByKey, manufacturersByKey, index }) => {
  const slug = buildProductSlug({ name: product.name });
  const sku = buildProductSku({
    category: CATEGORY_KEY,
    subCategory: product.subCategory,
    slug,
    name: product.name,
  });
  const typeKey = buildProductTypeKey({
    category: CATEGORY_KEY,
    subCategory: product.subCategory,
  });
  const material = materialsByKey.get(product.materialKeys[0]);
  const manufacturer = manufacturersByKey.get(product.manufacturerKey);
  const images = [
    placeholderImage(`${product.name.en} hero`),
    placeholderImage(`${product.name.en} room view`),
    placeholderImage(`${product.name.en} details`),
    placeholderImage(`${product.name.en} dimensions`),
  ];

  return {
    name: product.name,
    description: {
      ua: `${product.name.ua} з повним комплектом характеристик, прив'язкою до складів і магазинів та готовою карткою для каталогу.`,
      en: `${product.name.en} with complete specifications, inventory links and catalog-ready product data.`,
    },
    sku,
    slug,
    category: CATEGORY_KEY,
    subCategory: product.subCategory,
    typeKey,
    images,
    previewImage: images[0],
    modelUrl: buildModelUrl(slug),
    styleKeys: product.styleKeys,
    colorKeys: product.colorKeys,
    roomKeys: ["bedroom", ...(product.subCategory === "kids" || product.subCategory === "bunk" ? ["kids"] : [])],
    collectionKeys: product.collectionKeys,
    featureKeys: product.featureKeys,
    dimensions: product.dimensions,
    specifications: {
      ...product.specifications,
      ...product.dimensions,
      ...(material ? { material: material._id } : {}),
      ...(manufacturer ? { manufacturer: manufacturer._id } : {}),
      materialKey: product.materialKeys[0],
      materialKeys: product.materialKeys,
      materials: product.materialKeys.map((key) => ({
        key,
        label: key.replace(/_/g, " "),
      })),
      manufacturerKey: product.manufacturerKey,
      countryOfOrigin: manufacturer?.country || "Ukraine",
      seedTag: SEED_TAG,
    },
    price: product.price,
    discount: product.discount,
    inStock: true,
    stockQty: 0,
    status: "active",
    ratingAvg: 4.6 + (index % 4) * 0.1,
    ratingCount: 8 + index * 3,
  };
};

const upsertProducts = async (references) => {
  const products = [];

  for (const [index, product] of bedDefs.entries()) {
    const doc = buildProductDoc({ product, ...references, index });
    const result = await Product.findOneAndUpdate(
      { slug: doc.slug },
      {
        $set: {
          ...doc,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: daysAgo(20 - index),
        },
      },
      { new: true, upsert: true, runValidators: true }
    );
    products.push(result.toObject?.() || result);
  }

  return products;
};

const syncInventory = async ({ products, locationsByNameKey }) => {
  const productBySlug = new Map(products.map((product) => [product.slug, product]));
  let touchedRows = 0;
  let movementRows = 0;

  for (const productDef of bedDefs) {
    const slug = buildProductSlug({ name: productDef.name });
    const product = productBySlug.get(slug);
    if (!product) continue;

    for (const row of productDef.inventory) {
      const location = locationsByNameKey.get(row.nameKey);
      const existing = await Inventory.findOne({ product: product._id, location: location._id });
      const previousOnHand = toNumber(existing?.onHand, 0);
      const previousReserved = toNumber(existing?.reserved, 0);
      const nextOnHand = toNumber(row.onHand, 0);
      const nextReserved = toNumber(row.reserved, 0);

      await Inventory.updateOne(
        { product: product._id, location: location._id },
        {
          $set: {
            product: product._id,
            location: location._id,
            onHand: nextOnHand,
            reserved: nextReserved,
            zone: pickStr(row.zone),
            note: `[${SEED_TAG}] ${product.name.en} at ${location.name || location.nameKey}`,
            isShowcase: !!row.isShowcase,
          },
        },
        { upsert: true }
      );
      touchedRows += 1;

      const deltaOnHand = nextOnHand - previousOnHand;
      const deltaReserved = nextReserved - previousReserved;
      if (!existing || deltaOnHand || deltaReserved) {
        await InventoryMovement.create({
          type: "upsert",
          product: product._id,
          location: location._id,
          fromLocation: null,
          toLocation: null,
          deltaOnHand,
          deltaReserved,
          previousOnHand,
          nextOnHand,
          previousReserved,
          nextReserved,
          quantity: Math.abs(deltaOnHand),
          zone: pickStr(row.zone),
          note: `[${SEED_TAG}] Bed product inventory sync`,
          isShowcase: !!row.isShowcase,
          actorId: "seed-bed-products",
          actorName: "Seed Bed Products",
          reason: SEED_TAG,
          meta: { seedTag: SEED_TAG, locationNameKey: row.nameKey },
        });
        movementRows += 1;
      }
    }
  }

  return { touchedRows, movementRows };
};

const recalculateBedStock = async () => {
  const beds = await Product.find({ category: CATEGORY_KEY }).select("_id").lean();
  const productIds = beds.map((product) => product._id);

  const stockStats = await Inventory.aggregate([
    { $match: { product: { $in: productIds } } },
    {
      $group: {
        _id: "$product",
        onHand: { $sum: "$onHand" },
        reserved: { $sum: "$reserved" },
      },
    },
  ]);

  const stockMap = new Map(
    stockStats.map((item) => [
      String(item._id),
      Math.max(0, toNumber(item.onHand) - toNumber(item.reserved)),
    ])
  );

  if (!productIds.length) return { updated: 0 };

  const result = await Product.bulkWrite(
    productIds.map((productId) => {
      const stockQty = stockMap.get(String(productId)) || 0;
      return {
        updateOne: {
          filter: { _id: productId },
          update: {
            $set: {
              stockQty,
              inStock: stockQty > 0,
            },
          },
        },
      };
    })
  );

  return { updated: result.modifiedCount || result.matchedCount || productIds.length };
};

const summarize = async () => {
  const products = await Product.find({ category: CATEGORY_KEY })
    .select("_id sku slug name subCategory typeKey price discount stockQty inStock specifications dimensions")
    .sort({ subCategory: 1, slug: 1 })
    .lean();

  const inventory = await Inventory.find({ product: { $in: products.map((product) => product._id) } })
    .populate("location", "type city name nameKey address isActive")
    .lean();

  const inventoryByProduct = new Map();
  inventory.forEach((row) => {
    const key = String(row.product);
    if (!inventoryByProduct.has(key)) inventoryByProduct.set(key, []);
    inventoryByProduct.get(key).push({
      location: row.location?.name || row.location?.nameKey || "",
      city: row.location?.city || "",
      type: row.location?.type || "",
      onHand: row.onHand,
      reserved: row.reserved,
      available: Math.max(0, toNumber(row.onHand) - toNumber(row.reserved)),
      zone: row.zone,
      isShowcase: row.isShowcase,
    });
  });

  return products.map((product) => ({
    sku: product.sku,
    slug: product.slug,
    name: product.name?.ua,
    subCategory: product.subCategory,
    typeKey: product.typeKey,
    price: product.price,
    discount: product.discount,
    stockQty: product.stockQty,
    inStock: product.inStock,
    materialKey: product.specifications?.materialKey,
    manufacturerKey: product.specifications?.manufacturerKey,
    dimensions: product.dimensions,
    inventory: inventoryByProduct.get(String(product._id)) || [],
  }));
};

async function main() {
  await ensureMongo();
  console.log("Connected to MongoDB");

  await ensureCategoryTree();
  const references = await ensureReferences();
  const locationsByNameKey = await loadLocations();
  const products = await upsertProducts(references);
  const inventoryResult = await syncInventory({ products, locationsByNameKey });
  const stockResult = await recalculateBedStock();
  const summary = await summarize();

  console.log(
    JSON.stringify(
      {
        ok: true,
        seedTag: SEED_TAG,
        upsertedBedProducts: products.length,
        inventoryRowsTouched: inventoryResult.touchedRows,
        inventoryMovementsCreated: inventoryResult.movementRows,
        bedStockRowsUpdated: stockResult.updated,
        summary,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("Bed product seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => null);
  });
