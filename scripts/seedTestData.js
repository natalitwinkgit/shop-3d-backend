import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import "../config/env.js";
import Cart from "../models/Cart.js";
import Category from "../models/Category.js";
import Inventory from "../models/Inventory.js";
import InventoryMovement from "../models/InventoryMovement.js";
import Like from "../models/Like.js";
import Location from "../models/Location.js";
import Message from "../models/Message.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Review from "../models/Review.js";
import SubCategory from "../models/SubCategory.js";
import User, { ADMIN_ROLES } from "../models/userModel.js";
import { syncUserCommerceData } from "../services/userProfileService.js";

const SEED_TAG = "demo-test-v1";
const SEED_PREFIX = "demo-";
const SEED_DOMAIN = "demo.shop3d.local";
const DEFAULT_PASSWORD = process.env.SEED_TEST_PASSWORD || "Test12345!";
const clearOnly = process.argv.includes("--clear");

const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const seedPrefixRegex = new RegExp(`^${escapeRegex(SEED_PREFIX)}`, "i");
const seedEmailRegex = new RegExp(`@${escapeRegex(SEED_DOMAIN)}$`, "i");
const seedLocationRegex = /^demo\./i;
const seedTextRegex = new RegExp(`^\\[${escapeRegex(SEED_TAG)}\\]`);

const daysAgo = (days, hour = 11) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date;
};

const daysAhead = (days, hour = 14) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
};

const placeholderImage = (label) =>
  `https://placehold.co/1200x900/f1d8bf/4b2e1f?text=${encodeURIComponent(label)}`;

const computeDiscountedPrice = (product) => {
  const price = Number(product?.price || 0);
  const discount = Math.max(0, Math.min(100, Number(product?.discount || 0)));
  return Math.round(price * (1 - discount / 100));
};

const buildCardNumber = (index) => `DC-DEMO${String(index + 1).padStart(4, "0")}`;

const categoryDefs = [
  {
    category: "demo-sofas",
    names: { ua: "Demo Sofas", en: "Demo Sofas" },
    children: [
      { key: "straight", names: { ua: "Straight", en: "Straight" } },
      { key: "corner", names: { ua: "Corner", en: "Corner" } },
      { key: "modular", names: { ua: "Modular", en: "Modular" } },
    ],
  },
  {
    category: "demo-tables",
    names: { ua: "Demo Tables", en: "Demo Tables" },
    children: [
      { key: "dining", names: { ua: "Dining", en: "Dining" } },
      { key: "coffee", names: { ua: "Coffee", en: "Coffee" } },
      { key: "desk", names: { ua: "Desk", en: "Desk" } },
    ],
  },
  {
    category: "demo-chairs",
    names: { ua: "Demo Chairs", en: "Demo Chairs" },
    children: [
      { key: "dining-chair", names: { ua: "Dining Chair", en: "Dining Chair" } },
      { key: "armchair", names: { ua: "Armchair", en: "Armchair" } },
      { key: "office-chair", names: { ua: "Office Chair", en: "Office Chair" } },
    ],
  },
  {
    category: "demo-beds",
    names: { ua: "Demo Beds", en: "Demo Beds" },
    children: [
      { key: "double", names: { ua: "Double", en: "Double" } },
      { key: "soft", names: { ua: "Soft", en: "Soft" } },
      { key: "storage", names: { ua: "Storage", en: "Storage" } },
    ],
  },
];

const productDefs = [
  {
    slug: "demo-sofa-nova",
    nameUa: "Nova Sofa",
    nameEn: "Nova Sofa",
    category: "demo-sofas",
    subCategory: "straight",
    price: 38999,
    discount: 10,
    colorKeys: ["sand", "cream"],
    styleKeys: ["modern", "soft"],
    roomKeys: ["living-room"],
    specifications: { widthCm: 228, depthCm: 96, upholstery: "boucle", seats: 3 },
  },
  {
    slug: "demo-sofa-luna",
    nameUa: "Luna Corner Sofa",
    nameEn: "Luna Corner Sofa",
    category: "demo-sofas",
    subCategory: "corner",
    price: 46999,
    discount: 12,
    colorKeys: ["olive", "stone"],
    styleKeys: ["contemporary"],
    roomKeys: ["living-room"],
    specifications: { widthCm: 278, depthCm: 172, upholstery: "velvet", seats: 4 },
  },
  {
    slug: "demo-sofa-axis",
    nameUa: "Axis Modular Sofa",
    nameEn: "Axis Modular Sofa",
    category: "demo-sofas",
    subCategory: "modular",
    price: 57999,
    discount: 8,
    colorKeys: ["graphite", "beige"],
    styleKeys: ["premium"],
    roomKeys: ["living-room"],
    specifications: { widthCm: 310, depthCm: 188, upholstery: "matte-weave", modules: 4 },
  },
  {
    slug: "demo-table-grain",
    nameUa: "Grain Dining Table",
    nameEn: "Grain Dining Table",
    category: "demo-tables",
    subCategory: "dining",
    price: 24999,
    discount: 5,
    colorKeys: ["oak", "walnut"],
    styleKeys: ["scandinavian"],
    roomKeys: ["dining-room"],
    specifications: { widthCm: 180, depthCm: 90, material: "oak veneer" },
  },
  {
    slug: "demo-table-arc",
    nameUa: "Arc Coffee Table",
    nameEn: "Arc Coffee Table",
    category: "demo-tables",
    subCategory: "coffee",
    price: 8999,
    discount: 0,
    colorKeys: ["travertine", "cream"],
    styleKeys: ["minimal"],
    roomKeys: ["living-room"],
    specifications: { widthCm: 95, depthCm: 60, material: "sintered stone" },
  },
  {
    slug: "demo-table-grid",
    nameUa: "Grid Work Desk",
    nameEn: "Grid Work Desk",
    category: "demo-tables",
    subCategory: "desk",
    price: 15999,
    discount: 7,
    colorKeys: ["smoke", "ash"],
    styleKeys: ["urban"],
    roomKeys: ["office"],
    specifications: { widthCm: 140, depthCm: 70, drawers: 2 },
  },
  {
    slug: "demo-chair-mono",
    nameUa: "Mono Dining Chair",
    nameEn: "Mono Dining Chair",
    category: "demo-chairs",
    subCategory: "dining-chair",
    price: 4999,
    discount: 0,
    colorKeys: ["linen", "brown"],
    styleKeys: ["clean"],
    roomKeys: ["dining-room"],
    specifications: { widthCm: 48, depthCm: 54, frame: "powder steel" },
  },
  {
    slug: "demo-chair-halo",
    nameUa: "Halo Armchair",
    nameEn: "Halo Armchair",
    category: "demo-chairs",
    subCategory: "armchair",
    price: 13999,
    discount: 15,
    colorKeys: ["terracotta", "cream"],
    styleKeys: ["accent"],
    roomKeys: ["living-room", "bedroom"],
    specifications: { widthCm: 78, depthCm: 82, upholstery: "textured weave" },
  },
  {
    slug: "demo-chair-pivot",
    nameUa: "Pivot Office Chair",
    nameEn: "Pivot Office Chair",
    category: "demo-chairs",
    subCategory: "office-chair",
    price: 11999,
    discount: 9,
    colorKeys: ["black", "sand"],
    styleKeys: ["ergonomic"],
    roomKeys: ["office"],
    specifications: { widthCm: 66, depthCm: 68, mechanism: "tilt lock" },
  },
  {
    slug: "demo-bed-linen",
    nameUa: "Linen Bed",
    nameEn: "Linen Bed",
    category: "demo-beds",
    subCategory: "double",
    price: 32999,
    discount: 6,
    colorKeys: ["ivory", "latte"],
    styleKeys: ["soft"],
    roomKeys: ["bedroom"],
    specifications: { widthCm: 170, depthCm: 214, mattressCm: "160x200" },
  },
  {
    slug: "demo-bed-cloud",
    nameUa: "Cloud Soft Bed",
    nameEn: "Cloud Soft Bed",
    category: "demo-beds",
    subCategory: "soft",
    price: 42999,
    discount: 11,
    colorKeys: ["stone", "dusty-rose"],
    styleKeys: ["hotel"],
    roomKeys: ["bedroom"],
    specifications: { widthCm: 192, depthCm: 228, mattressCm: "180x200" },
  },
  {
    slug: "demo-bed-boxy",
    nameUa: "Boxy Storage Bed",
    nameEn: "Boxy Storage Bed",
    category: "demo-beds",
    subCategory: "storage",
    price: 37999,
    discount: 10,
    colorKeys: ["taupe", "walnut"],
    styleKeys: ["practical"],
    roomKeys: ["bedroom"],
    specifications: { widthCm: 172, depthCm: 215, storage: "lift-up base" },
  },
];

const locationDefs = [
  {
    type: "showroom",
    city: "Kyiv",
    nameKey: "demo.Kyiv Showroom",
    addressKey: "Kyiv, Khreshchatyk 12",
    coordinates: { lat: 50.4501, lng: 30.5234 },
    phone: "+380441110001",
    workingHours: { ua: "10:00-20:00", en: "10:00-20:00" },
    isActive: true,
  },
  {
    type: "warehouse",
    city: "Kyiv",
    nameKey: "demo.Kyiv Warehouse",
    addressKey: "Kyiv, Pivnichna 8",
    coordinates: { lat: 50.485, lng: 30.49 },
    phone: "+380441110002",
    workingHours: { ua: "09:00-18:00", en: "09:00-18:00" },
    isActive: true,
  },
  {
    type: "shop",
    city: "Lviv",
    nameKey: "demo.Lviv Shop",
    addressKey: "Lviv, Horodotska 88",
    coordinates: { lat: 49.8397, lng: 24.0297 },
    phone: "+380321110003",
    workingHours: { ua: "10:00-19:00", en: "10:00-19:00" },
    isActive: true,
  },
  {
    type: "office",
    city: "Odesa",
    nameKey: "demo.Odesa Office",
    addressKey: "Odesa, Kanatna 14",
    coordinates: { lat: 46.4825, lng: 30.7233 },
    phone: "+380481110004",
    workingHours: { ua: "09:00-17:00", en: "09:00-17:00" },
    isActive: false,
  },
];

const userDefs = [
  { name: "Olena Koval", email: `olena@${SEED_DOMAIN}`, phone: "+380500000101", city: "Kyiv", status: "active" },
  { name: "Taras Melnyk", email: `taras@${SEED_DOMAIN}`, phone: "+380500000102", city: "Lviv", status: "active" },
  { name: "Iryna Bondar", email: `iryna@${SEED_DOMAIN}`, phone: "+380500000103", city: "Dnipro", status: "active" },
  { name: "Maksym Shevchuk", email: `maksym@${SEED_DOMAIN}`, phone: "+380500000104", city: "Odesa", status: "active" },
  { name: "Sofiia Kravets", email: `sofiia@${SEED_DOMAIN}`, phone: "+380500000105", city: "Kharkiv", status: "active" },
  { name: "Andrii Hnatiuk", email: `andrii@${SEED_DOMAIN}`, phone: "+380500000106", city: "Vinnytsia", status: "banned" },
];

async function clearDemoData() {
  const [seedUsers, seedProducts, seedLocations, seedCategories] = await Promise.all([
    User.find({ email: seedEmailRegex }).select("_id").lean(),
    Product.find({ slug: seedPrefixRegex }).select("_id").lean(),
    Location.find({ nameKey: seedLocationRegex }).select("_id").lean(),
    Category.find({ category: seedPrefixRegex }).select("category").lean(),
  ]);

  const userIds = seedUsers.map((item) => item._id);
  const userIdStrings = userIds.map((item) => String(item));
  const productIds = seedProducts.map((item) => item._id);
  const locationIds = seedLocations.map((item) => item._id);
  const categoryKeys = seedCategories.map((item) => item.category);

  await Promise.all([
    Cart.deleteMany({ user: { $in: userIds } }),
    Like.deleteMany({
      $or: [{ user: { $in: userIds } }, { product: { $in: productIds } }],
    }),
    Review.deleteMany({
      $or: [{ user: { $in: userIds } }, { product: { $in: productIds } }],
    }),
    Message.deleteMany({
      $or: [
        { "meta.seedTag": SEED_TAG },
        { sender: { $in: userIdStrings } },
        { receiver: { $in: userIdStrings } },
        { text: seedTextRegex },
      ],
    }),
    Order.deleteMany({
      $or: [
        { user: { $in: userIds } },
        { comment: seedTextRegex },
        { adminNote: seedTextRegex },
      ],
    }),
    InventoryMovement.deleteMany({
      $or: [
        { "meta.seedTag": SEED_TAG },
        { product: { $in: productIds } },
        { location: { $in: locationIds } },
        { fromLocation: { $in: locationIds } },
        { toLocation: { $in: locationIds } },
      ],
    }),
    Inventory.deleteMany({
      $or: [{ product: { $in: productIds } }, { location: { $in: locationIds } }],
    }),
  ]);

  await Promise.all([
    Product.deleteMany({ _id: { $in: productIds } }),
    SubCategory.deleteMany({ categoryKey: { $in: categoryKeys } }),
    Category.deleteMany({ category: seedPrefixRegex }),
    Location.deleteMany({ _id: { $in: locationIds } }),
    User.deleteMany({ _id: { $in: userIds } }),
  ]);
}

async function resolveChatAdmin(passwordHash) {
  let adminDoc = await User.findOne({
    role: { $in: ADMIN_ROLES },
    isAiAssistant: false,
    email: { $not: seedEmailRegex },
  })
    .select("_id name email role")
    .sort({ createdAt: 1 })
    .lean();

  if (adminDoc) {
    return { admin: adminDoc, created: false };
  }

  adminDoc = await User.findOne({ role: { $in: ADMIN_ROLES } })
    .select("_id name email role")
    .sort({ createdAt: 1 })
    .lean();

  if (adminDoc) {
    return { admin: adminDoc, created: false };
  }

  const createdAdmin = await User.create({
    name: "Demo Support Admin",
    email: `support@${SEED_DOMAIN}`,
    phone: "+380500000199",
    phoneNormalized: "+380500000199",
    passwordHash,
    role: "admin",
    status: "active",
    city: "Kyiv",
    likes: [],
    rewards: [],
    loyalty: {
      cardNumber: "DC-DEMOSUPP",
      tier: "none",
      baseDiscountPct: 0,
      totalSpent: 0,
      completedOrders: 0,
      lastOrderAt: null,
      notes: "",
      manualOverride: false,
    },
    isOnline: false,
    presence: "offline",
    createdAt: daysAgo(30),
    updatedAt: daysAgo(30),
  });

  return {
    admin: {
      _id: createdAdmin._id,
      name: createdAdmin.name,
      email: createdAdmin.email,
      role: createdAdmin.role,
    },
    created: true,
  };
}

async function seedCategories() {
  const categoryDocs = categoryDefs.map((category, index) => ({
    category: category.category,
    names: category.names,
    image: placeholderImage(category.names.en),
    order: index + 1,
    children: category.children.map((child, childIndex) => ({
      key: child.key,
      names: child.names,
      image: placeholderImage(child.names.en),
      order: childIndex + 1,
    })),
    folderPath: `__${SEED_TAG}/${category.category}`,
    createdAt: daysAgo(28 - index),
    updatedAt: daysAgo(8 - index),
  }));

  const subCategoryDocs = categoryDefs.flatMap((category, categoryIndex) =>
    category.children.map((child, childIndex) => ({
      categoryKey: category.category,
      key: child.key,
      name: child.names,
      sort: childIndex + 1,
      isActive: true,
      createdAt: daysAgo(28 - categoryIndex),
      updatedAt: daysAgo(8 - childIndex),
    }))
  );

  await Category.insertMany(categoryDocs);
  await SubCategory.insertMany(subCategoryDocs);
}

async function seedLocations() {
  const docs = locationDefs.map((location, index) => ({
    ...location,
    createdAt: daysAgo(24 - index),
    updatedAt: daysAgo(5 - index),
  }));

  return Location.insertMany(docs);
}

async function seedProducts() {
  const docs = productDefs.map((product, index) => ({
    name: { ua: product.nameUa, en: product.nameEn },
    description: {
      ua: `Demo item for admin and storefront checks: ${product.nameUa}.`,
      en: `Demo item for admin and storefront checks: ${product.nameEn}.`,
    },
    slug: product.slug,
    category: product.category,
    subCategory: product.subCategory,
    typeKey: `${product.category}:${product.subCategory}`,
    images: [placeholderImage(product.nameEn)],
    modelUrl: "",
    styleKeys: product.styleKeys,
    colorKeys: product.colorKeys,
    roomKeys: product.roomKeys,
    collectionKeys: ["demo-collection"],
    featureKeys: ["demo", "seeded"],
    specifications: product.specifications,
    price: product.price,
    discount: product.discount,
    inStock: true,
    stockQty: 0,
    status: "active",
    ratingAvg: 0,
    ratingCount: 0,
    createdAt: daysAgo(20 - index),
    updatedAt: daysAgo(4 - (index % 4)),
  }));

  return Product.insertMany(docs);
}

async function seedUsers(passwordHash) {
  const docs = userDefs.map((user, index) => ({
    name: user.name,
    email: user.email,
    phone: user.phone,
    phoneNormalized: user.phone,
    passwordHash,
    role: "user",
    status: user.status,
    city: user.city,
    likes: [],
    rewards: [],
    loyalty: {
      cardNumber: buildCardNumber(index),
      tier: "none",
      baseDiscountPct: 0,
      totalSpent: 0,
      completedOrders: 0,
      lastOrderAt: null,
      notes: "",
      manualOverride: false,
    },
    isAiAssistant: false,
    isOnline: index < 2,
    presence: index < 2 ? "online" : "offline",
    lastSeen: index < 2 ? daysAgo(0, 12 + index) : daysAgo(2 + index),
    lastActivityAt: index < 2 ? daysAgo(0, 12 + index) : daysAgo(2 + index),
    lastLoginAt: daysAgo(1 + index),
    createdAt: daysAgo(18 - index),
    updatedAt: daysAgo(3 - (index % 3)),
  }));

  return User.insertMany(docs);
}

async function seedLikes(users, products) {
  const likeDocs = [];
  const bulkOps = [];

  users.slice(0, 4).forEach((user, index) => {
    const likedProducts = [products[index], products[index + 4]];
    const embeddedLikes = likedProducts.map((product) => ({
      productId: String(product._id),
      productName: product.name,
      productCategory: product.category,
      productImage: product.images?.[0] || "",
      discount: Number(product.discount || 0),
      price: Number(product.price || 0),
    }));

    bulkOps.push({
      updateOne: {
        filter: { _id: user._id },
        update: { $set: { likes: embeddedLikes } },
      },
    });

    likedProducts.forEach((product) => {
      likeDocs.push({
        user: user._id,
        product: product._id,
        productName: product.name,
        productImage: product.images?.[0] || "",
        productCategory: product.category,
        price: Number(product.price || 0),
        discount: Number(product.discount || 0),
        createdAt: daysAgo(6 - index),
        updatedAt: daysAgo(2 - index),
      });
    });
  });

  await Promise.all([User.bulkWrite(bulkOps), Like.insertMany(likeDocs)]);
}

async function seedCarts(users, products) {
  const docs = users.slice(0, 4).map((user, index) => ({
    user: user._id,
    items: [
      { product: products[index]._id, qty: 1 + (index % 2) },
      { product: products[index + 2]._id, qty: 1 },
    ],
    createdAt: daysAgo(4 - index),
    updatedAt: daysAgo(index),
  }));

  await Cart.insertMany(docs);
}

async function seedInventory(products, locations, admin) {
  const showroom = locations.find((location) => location.type === "showroom");
  const warehouse = locations.find((location) => location.type === "warehouse");
  const shop = locations.find((location) => location.type === "shop");
  const rows = [];
  const movements = [];

  products.forEach((product, index) => {
    const locationPool = index % 2 === 0 ? [warehouse, showroom] : [warehouse, shop];

    locationPool.forEach((location, rowIndex) => {
      const onHand = Math.max(0, 3 + ((index + 2) * (rowIndex + 1)) % 11);
      const reserved = Math.min(onHand, (index + rowIndex) % 3);
      const isShowcase = rowIndex === 1 && location.type !== "warehouse" && index % 3 === 0;

      rows.push({
        product: product._id,
        productId: product._id,
        location: location._id,
        locationId: location._id,
        onHand,
        reserved,
        zone: rowIndex === 0 ? "A-01" : "SHOW",
        note: `[${SEED_TAG}] Demo inventory row`,
        isShowcase,
        createdAt: daysAgo(12 - rowIndex),
        updatedAt: daysAgo(index % 5),
      });

      movements.push({
        type: "upsert",
        product: product._id,
        location: location._id,
        fromLocation: null,
        toLocation: null,
        deltaOnHand: onHand,
        deltaReserved: reserved,
        previousOnHand: 0,
        nextOnHand: onHand,
        previousReserved: 0,
        nextReserved: reserved,
        quantity: onHand,
        zone: rowIndex === 0 ? "A-01" : "SHOW",
        note: `[${SEED_TAG}] Initial stock fill`,
        isShowcase,
        actorId: String(admin._id),
        actorName: admin.name || admin.email || "Demo Admin",
        reason: "demo seed",
        meta: { seedTag: SEED_TAG },
        createdAt: daysAgo(12 - rowIndex),
        updatedAt: daysAgo(index % 5),
      });
    });
  });

  await Promise.all([
    Inventory.collection.insertMany(rows),
    InventoryMovement.insertMany(movements),
  ]);

  const stockStats = await Inventory.aggregate([
    {
      $match: {
        product: { $in: products.map((product) => product._id) },
      },
    },
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
      Math.max(0, Number(item.onHand || 0) - Number(item.reserved || 0)),
    ])
  );

  await Product.bulkWrite(
    products.map((product) => {
      const stockQty = stockMap.get(String(product._id)) || 0;
      return {
        updateOne: {
          filter: { _id: product._id },
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
}

async function seedOrders(users, products, locations) {
  const activeUsers = users.filter((user) => user.status === "active");
  const pickupLocations = locations.filter((location) =>
    ["showroom", "shop"].includes(location.type)
  );
  const statuses = [
    "new",
    "confirmed",
    "processing",
    "shipped",
    "completed",
    "completed",
    "cancelled",
    "processing",
    "new",
    "completed",
    "confirmed",
    "shipped",
  ];

  const docs = statuses.map((status, index) => {
    const user = activeUsers[index % activeUsers.length];
    const itemCount = 1 + (index % 3);
    const methodIndex = index % 3;
    const selectedProducts = Array.from({ length: itemCount }, (_item, itemIndex) =>
      products[(index + itemIndex * 2) % products.length]
    );

    const items = selectedProducts.map((product, itemIndex) => {
      const qty = 1 + ((index + itemIndex) % 2);
      const price = computeDiscountedPrice(product);

      return {
        productId: product._id,
        name: product.name.ua,
        qty,
        price,
        sku: "",
        image: product.images?.[0] || "",
      };
    });

    const subtotal = items.reduce((sum, item) => sum + item.qty * item.price, 0);
    const pickupLocation = pickupLocations[index % pickupLocations.length];
    const method = methodIndex === 0 ? "pickup" : methodIndex === 1 ? "courier" : "nova_poshta";
    const createdAt = daysAgo(16 - index, 9 + (index % 6));

    return {
      user: user._id,
      customer: {
        fullName: user.name,
        phone: user.phone,
        email: user.email,
      },
      delivery: {
        city: user.city,
        method,
        pickupLocationId: method === "pickup" ? pickupLocation._id : null,
        address: method === "courier" ? `${user.city}, Demo street ${index + 3}` : "",
        npOffice: method === "nova_poshta" ? `Branch ${index + 1}` : "",
      },
      comment: `[${SEED_TAG}] Demo order ${index + 1}`,
      items,
      totals: {
        subtotal,
        loyaltyDiscount: 0,
        rewardDiscount: 0,
        totalSavings: 0,
        cartTotal: subtotal,
      },
      loyaltySnapshot: {
        cardNumber: buildCardNumber(index % activeUsers.length),
        tier: "none",
        baseDiscountPct: 0,
      },
      appliedReward: {
        rewardId: "",
        type: "",
        title: "",
        discountPct: 0,
        amountOff: 0,
        minOrderTotal: 0,
      },
      status,
      scheduledAt:
        status === "confirmed" || status === "processing" ? daysAhead((index % 3) + 1) : null,
      adminNote:
        status === "cancelled"
          ? `[${SEED_TAG}] Customer postponed the purchase`
          : status === "processing" || status === "shipped"
            ? `[${SEED_TAG}] Priority handling`
            : "",
      cancelledAt: status === "cancelled" ? daysAgo(2) : null,
      createdAt,
      updatedAt: new Date(createdAt.getTime() + 6 * 60 * 60 * 1000),
    };
  });

  return Order.insertMany(docs);
}

async function syncSeedUsers(users) {
  await Promise.all(users.map((user) => syncUserCommerceData(user._id)));

  return User.find({ _id: { $in: users.map((user) => user._id) } })
    .select("_id loyalty")
    .lean();
}

async function syncOrderLoyaltySnapshots(loyaltyUsers) {
  const loyaltyMap = new Map(
    loyaltyUsers.map((user) => [String(user._id), user.loyalty || {}])
  );

  const orders = await Order.find({ comment: seedTextRegex }).select("_id user").lean();
  if (!orders.length) return;

  await Order.bulkWrite(
    orders.map((order) => {
      const loyalty = loyaltyMap.get(String(order.user)) || {};
      return {
        updateOne: {
          filter: { _id: order._id },
          update: {
            $set: {
              loyaltySnapshot: {
                cardNumber: loyalty.cardNumber || "",
                tier: loyalty.tier || "none",
                baseDiscountPct: Number(loyalty.baseDiscountPct || 0),
              },
            },
          },
        },
      };
    })
  );
}

async function seedReviews(users, products) {
  const activeUsers = users.filter((user) => user.status === "active");
  const ratings = [5, 4, 5, 3, 4, 5, 4, 5];

  const docs = ratings.map((rating, index) => ({
    product: products[index]._id,
    user: activeUsers[index % activeUsers.length]._id,
    rating,
    title: `Demo review ${index + 1}`,
    text: `Seeded review for ${products[index].name.en}. Useful for testing review lists and rating widgets.`,
    isApproved: true,
    createdAt: daysAgo(10 - index),
    updatedAt: daysAgo(4 - (index % 4)),
  }));

  await Review.insertMany(docs);

  const ratingStats = await Review.aggregate([
    {
      $match: {
        product: { $in: products.map((product) => product._id) },
        isApproved: true,
      },
    },
    {
      $group: {
        _id: "$product",
        avgRating: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]);

  const ratingMap = new Map(
    ratingStats.map((item) => [
      String(item._id),
      {
        avgRating: Math.round(Number(item.avgRating || 0) * 10) / 10,
        count: Number(item.count || 0),
      },
    ])
  );

  await Product.bulkWrite(
    products.map((product) => {
      const ratingMeta = ratingMap.get(String(product._id)) || {
        avgRating: 0,
        count: 0,
      };

      return {
        updateOne: {
          filter: { _id: product._id },
          update: {
            $set: {
              ratingAvg: ratingMeta.avgRating,
              ratingCount: ratingMeta.count,
            },
          },
        },
      };
    })
  );
}

async function seedMessages(users, admin) {
  const adminId = String(admin._id);
  const prompts = [
    "Hello, can you confirm if the sofa is available this week?",
    "Do you have pickup in Kyiv for this item?",
    "Please advise on delivery time for Lviv.",
    "Can I reserve the bed before payment?",
    "I need dimensions for the armchair model.",
  ];

  const replies = [
    "Yes, the item is available and we can reserve it for two days.",
    "Pickup is available in Kyiv showroom after confirmation.",
    "Delivery to Lviv usually takes two to three business days.",
    "Reservation is possible after a short confirmation call.",
    "I have sent the dimensions and stock note in the chat thread.",
  ];

  const docs = users
    .filter((user) => user.status === "active")
    .flatMap((user, index) => {
      const userId = String(user._id);
      const baseDate = daysAgo(5 - index, 10 + index);

      return [
        {
          sender: userId,
          receiver: adminId,
          text: prompts[index % prompts.length],
          isGuest: false,
          guestName: "",
          isRead: true,
          source: "human",
          meta: { seedTag: SEED_TAG },
          createdAt: baseDate,
          updatedAt: baseDate,
        },
        {
          sender: adminId,
          receiver: userId,
          text: replies[index % replies.length],
          isGuest: false,
          guestName: "",
          isRead: true,
          source: "human",
          meta: { seedTag: SEED_TAG },
          createdAt: new Date(baseDate.getTime() + 15 * 60 * 1000),
          updatedAt: new Date(baseDate.getTime() + 15 * 60 * 1000),
        },
        {
          sender: userId,
          receiver: adminId,
          text: `Thanks, please keep order slot ${index + 1} in mind.`,
          isGuest: false,
          guestName: "",
          isRead: index % 2 === 0,
          source: "human",
          meta: { seedTag: SEED_TAG },
          createdAt: new Date(baseDate.getTime() + 50 * 60 * 1000),
          updatedAt: new Date(baseDate.getTime() + 50 * 60 * 1000),
        },
      ];
    });

  await Message.insertMany(docs);
}

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required");
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`[${SEED_TAG}] Connected to MongoDB`);

  await clearDemoData();
  console.log(`[${SEED_TAG}] Previous demo data cleared`);

  if (clearOnly) {
    console.log(`[${SEED_TAG}] Clear complete`);
    await mongoose.disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const { admin, created: createdAdmin } = await resolveChatAdmin(passwordHash);

  await seedCategories();
  const [locations, products, users] = await Promise.all([
    seedLocations(),
    seedProducts(),
    seedUsers(passwordHash),
  ]);

  await seedInventory(products, locations, admin);
  await seedLikes(users, products);
  await seedCarts(users, products);
  await seedOrders(users, products, locations);
  const loyaltyUsers = await syncSeedUsers(users);
  await syncOrderLoyaltySnapshots(loyaltyUsers);
  await seedReviews(users, products);
  await seedMessages(users, admin);

  const summary = {
    seedTag: SEED_TAG,
    password: DEFAULT_PASSWORD,
    chatAdmin: {
      email: admin.email || "",
      role: admin.role || "",
      createdBySeed: createdAdmin,
    },
    counts: {
      categories: await Category.countDocuments({ category: seedPrefixRegex }),
      subcategories: await SubCategory.countDocuments({ categoryKey: seedPrefixRegex }),
      products: await Product.countDocuments({ slug: seedPrefixRegex }),
      users: await User.countDocuments({ email: seedEmailRegex }),
      orders: await Order.countDocuments({ comment: seedTextRegex }),
      messages: await Message.countDocuments({ "meta.seedTag": SEED_TAG }),
      locations: await Location.countDocuments({ nameKey: seedLocationRegex }),
      inventoryRows: await Inventory.countDocuments({
        product: { $in: products.map((product) => product._id) },
      }),
      reviews: await Review.countDocuments({
        product: { $in: products.map((product) => product._id) },
      }),
      carts: await Cart.countDocuments({ user: { $in: users.map((user) => user._id) } }),
      likes: await Like.countDocuments({ user: { $in: users.map((user) => user._id) } }),
    },
    sampleUsers: users.map((user) => ({
      email: user.email,
      role: user.role,
      status: user.status,
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(`[${SEED_TAG}] Seed failed`, error);
  try {
    await mongoose.disconnect();
  } catch {
    // no-op
  }
  process.exit(1);
});
