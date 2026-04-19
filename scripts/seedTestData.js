import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import "../config/env.js";
import Cart from "../models/Cart.js";
import Category from "../models/Category.js";
import Inventory from "../models/Inventory.js";
import InventoryMovement from "../models/InventoryMovement.js";
import Like from "../models/Like.js";
import Location from "../models/Location.js";
import LoyaltyCard from "../models/LoyaltyCard.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import Manufacturer from "../models/Manufacturer.js";
import Material from "../models/Material.js";
import Message from "../models/Message.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Review from "../models/Review.js";
import SubCategory from "../models/SubCategory.js";
import Translation from "../models/Translation.js";
import User, { ADMIN_ROLES } from "../models/userModel.js";
import { syncOrderLoyaltyEffects } from "../services/loyaltyService.js";
import { syncUserCommerceData } from "../services/userProfileService.js";
import {
  buildColorLookup,
  loadMergedProductColors,
  pickProductColor,
} from "./lib/productColorPalette.js";

const SEED_TAG = "demo-test-v1";
const SEED_PREFIX = "demo-";
const SEED_DOMAIN = "demo.shop3d.local";
const DEFAULT_PASSWORD = process.env.SEED_TEST_PASSWORD || "Test12345!";
const clearOnly = process.argv.includes("--clear");

const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const seedPrefixRegex = new RegExp(`^${escapeRegex(SEED_PREFIX)}`, "i");
const seedEmailRegex = new RegExp(`@${escapeRegex(SEED_DOMAIN)}$`, "i");
const seedLocationRegex = /^demo[_\.]/i;
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

const buildCloudinaryModelUrl = (slug) =>
  `https://res.cloudinary.com/demo-furniture-catalog/raw/upload/v1/products/models/${encodeURIComponent(slug)}.glb`;

const computeDiscountedPrice = (product) => {
  const price = Number(product?.price || 0);
  const discount = Math.max(0, Math.min(100, Number(product?.discount || 0)));
  return Math.round(price * (1 - discount / 100));
};

const buildCardNumber = (index) => `DC-DEMO${String(index + 1).padStart(4, "0")}`;
const roundMoney = (value) =>
  Math.max(0, Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100);
const addHours = (date, hours) => new Date(new Date(date).getTime() + hours * 60 * 60 * 1000);
const getFirstName = (name) => String(name || "").trim().split(/\s+/).filter(Boolean)[0] || "Клієнт";

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

const baseProductDefs = [
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

const normalizeKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const canonicalizeRoomKey = (value) => {
  const normalized = normalizeKey(value);
  const roomAliases = {
    living_room: ["living_room", "living-room", "livingroom"],
    bedroom: ["bedroom", "bed-room", "bed_room"],
    dining_room: ["dining_room", "dining-room", "diningroom"],
    home_office: ["home_office", "home-office", "office"],
  };

  const found = Object.entries(roomAliases).find(([, aliases]) => aliases.includes(normalized));
  return found?.[0] || normalized;
};

const pickMaterialKeys = (product) => {
  const source = JSON.stringify(product.specifications || {}).toLowerCase();
  const materialKeys = [];

  if (/(velvet|velour)/.test(source)) materialKeys.push("velour");
  if (/(boucle|linen|weave|textile|upholstery)/.test(source)) materialKeys.push("textile");
  if (/(oak|walnut|ash|wood|veneer)/.test(source)) materialKeys.push("wood");
  if (/mdf/.test(source)) materialKeys.push("mdf");
  if (/(steel|metal)/.test(source)) materialKeys.push("metal");
  if (/(stone|travertine)/.test(source)) materialKeys.push("stone");

  return Array.from(new Set(materialKeys.length ? materialKeys : ["textile"]));
};

const pickManufacturerKey = (product) => {
  if (product.category === "demo-sofas" || product.category === "demo-beds") return "soft_form";
  if (product.category === "demo-tables") return "woodline";
  return "comfort_lab";
};

const buildProductImages = (product, variantLabel = "") => {
  const base = [product.nameEn, variantLabel].filter(Boolean).join(" ");
  return [
    placeholderImage(`${base} hero shot`),
    placeholderImage(`${base} lifestyle view`),
    placeholderImage(`${base} close-up texture`),
    placeholderImage(`${base} dimensions card`),
  ];
};

const buildDescriptions = (product, materialKeys, variantLabel = "") => {
  const variantText = variantLabel ? ` ${variantLabel}` : "";
  const roomLabel = product.roomKeys.map(canonicalizeRoomKey).join(", ");

  return {
    ua:
      `${product.nameUa}${variantText} створений для щоденного використання у сучасному інтер'єрі. ` +
      `Модель підходить для зон ${roomLabel}, має збалансовану посадку, практичні матеріали ${materialKeys.join(", ")} ` +
      `та характеристику ${Object.entries(product.specifications || {})
        .slice(0, 3)
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ")}.`,
    en:
      `${product.nameEn}${variantText} is built for everyday use in a modern interior. ` +
      `It works well in ${roomLabel}, combines durable ${materialKeys.join(", ")} materials, and keeps the key specs visible for storefront and admin QA.`,
  };
};

const variantDescriptors = [
  { slugSuffix: "atelier", labelUa: "Atelier", labelEn: "Atelier", priceDelta: 3500, discountDelta: 2 },
  { slugSuffix: "studio", labelUa: "Studio", labelEn: "Studio", priceDelta: 2200, discountDelta: 0 },
];

const expandProductDefs = (defs = []) =>
  defs.flatMap((product, index) => {
    const materialKeys = pickMaterialKeys(product);
    const baseCollectionKey = normalizeKey(
      `${product.category.replace(/^demo-/, "")}_${canonicalizeRoomKey(product.roomKeys[0] || "living_room")}`
    );
    const manufacturerKey = pickManufacturerKey(product);
    const descriptor = variantDescriptors[index % variantDescriptors.length];
    const baseProduct = {
      ...product,
      roomKeys: product.roomKeys.map(canonicalizeRoomKey),
      materialKeys,
      manufacturerKey,
      collectionKeys: Array.from(new Set([baseCollectionKey, "demo-curated"])),
      featureKeys: Array.from(
        new Set([
          "made_in_ukraine",
          materialKeys.includes("velour") ? "premium_fabric" : "easy_care",
          product.discount > 0 ? "promo" : "new_arrival",
        ])
      ),
      images: buildProductImages(product),
      description: buildDescriptions(product, materialKeys),
    };

    const variantMaterialKeys = Array.from(new Set([...materialKeys, index % 2 === 0 ? "wood" : "textile"]));
    const variantProduct = {
      ...product,
      slug: `${product.slug}-${descriptor.slugSuffix}`,
      nameUa: `${product.nameUa} ${descriptor.labelUa}`,
      nameEn: `${product.nameEn} ${descriptor.labelEn}`,
      price: product.price + descriptor.priceDelta,
      discount: Math.min(20, product.discount + descriptor.discountDelta),
      colorKeys: Array.from(new Set([...product.colorKeys, index % 2 === 0 ? "walnut" : "cream"])),
      styleKeys: Array.from(new Set([...product.styleKeys, "signature"])),
      roomKeys: Array.from(
        new Set([
          ...product.roomKeys.map(canonicalizeRoomKey),
          product.category === "demo-tables" ? "home_office" : product.category === "demo-chairs" ? "bedroom" : canonicalizeRoomKey(product.roomKeys[0]),
        ])
      ),
      specifications: {
        ...(product.specifications || {}),
        edition: descriptor.labelEn,
        leadTimeDays: 7 + (index % 6),
      },
      materialKeys: variantMaterialKeys,
      manufacturerKey,
      collectionKeys: Array.from(new Set([baseCollectionKey, "demo-signature"])),
      featureKeys: ["made_in_ukraine", "signature", "ready_to_ship"],
      images: buildProductImages(product, descriptor.labelEn),
      description: buildDescriptions(product, variantMaterialKeys, descriptor.labelEn),
    };

    return [baseProduct, variantProduct];
  });

const productDefs = expandProductDefs(baseProductDefs);
const productColorPalette = loadMergedProductColors();
const productColorLookup = buildColorLookup(productColorPalette);

const buildProductDimensions = (specifications = {}) => {
  const dimensions = {};
  ["widthCm", "depthCm", "heightCm", "lengthCm", "diameterCm"].forEach((key) => {
    if (Number.isFinite(specifications[key])) dimensions[key] = specifications[key];
  });

  if (!Number.isFinite(dimensions.lengthCm) && Number.isFinite(specifications.depthCm)) {
    dimensions.lengthCm = specifications.depthCm;
  }

  return dimensions;
};

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
};

const titleFromKey = (key) =>
  String(key || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

async function seedReferenceDictionaries() {
  const materialKeys = Array.from(new Set(productDefs.flatMap((product) => product.materialKeys || [])));
  const manufacturerKeys = Array.from(new Set(productDefs.map((product) => product.manufacturerKey).filter(Boolean)));

  await Promise.all([
    ...materialKeys.map((key) => {
      const label = MATERIAL_LABELS[key] || { ua: titleFromKey(key), en: titleFromKey(key) };
      return Material.updateOne(
        { key },
        { $setOnInsert: { key, name: label, description: { ua: "", en: "" } } },
        { upsert: true }
      );
    }),
    ...manufacturerKeys.map((key) => {
      const label = MANUFACTURER_LABELS[key] || { name: titleFromKey(key), country: "" };
      return Manufacturer.updateOne(
        { key },
        { $setOnInsert: { key, name: label.name, country: label.country, website: "" } },
        { upsert: true }
      );
    }),
  ]);

  const [materials, manufacturers] = await Promise.all([
    Material.find({ key: { $in: materialKeys } }).lean(),
    Manufacturer.find({ key: { $in: manufacturerKeys } }).lean(),
  ]);

  return {
    materialByKey: new Map(materials.map((item) => [item.key, item])),
    manufacturerByKey: new Map(manufacturers.map((item) => [item.key, item])),
  };
}

const locationDefs = [
  {
    type: "showroom",
    city: "Kyiv",
    cityKey: "kyiv",
    name: "Kyiv Flagship Showroom",
    nameKey: "demo_kyiv_flagship_showroom",
    address: "Kyiv, Khreshchatyk 12",
    addressKey: "demo_kyiv_flagship_showroom_address",
    coordinates: { lat: 50.4501, lng: 30.5234 },
    phone: "+380441110001",
    workingHours: { ua: "Пн-Нд 10:00-20:00", en: "Mon-Sun 10:00-20:00" },
    isActive: true,
  },
  {
    type: "warehouse",
    city: "Kyiv",
    cityKey: "kyiv",
    name: "Kyiv Central Warehouse",
    nameKey: "demo_kyiv_central_warehouse",
    address: "Kyiv, Pivnichna 8",
    addressKey: "demo_kyiv_central_warehouse_address",
    coordinates: { lat: 50.485, lng: 30.49 },
    phone: "+380441110002",
    workingHours: { ua: "Пн-Сб 09:00-18:00", en: "Mon-Sat 09:00-18:00" },
    isActive: true,
  },
  {
    type: "shop",
    city: "Lviv",
    cityKey: "lviv",
    name: "Lviv City Store",
    nameKey: "demo_lviv_city_store",
    address: "Lviv, Horodotska 88",
    addressKey: "demo_lviv_city_store_address",
    coordinates: { lat: 49.8397, lng: 24.0297 },
    phone: "+380321110003",
    workingHours: { ua: "Пн-Нд 10:00-19:00", en: "Mon-Sun 10:00-19:00" },
    isActive: true,
  },
  {
    type: "warehouse",
    city: "Lviv",
    cityKey: "lviv",
    name: "Lviv Stock Hub",
    nameKey: "demo_lviv_stock_hub",
    address: "Lviv, Zelena 147",
    addressKey: "demo_lviv_stock_hub_address",
    coordinates: { lat: 49.814, lng: 24.0558 },
    phone: "+380321110004",
    workingHours: { ua: "Пн-Сб 09:00-18:00", en: "Mon-Sat 09:00-18:00" },
    isActive: true,
  },
  {
    type: "showroom",
    city: "Odesa",
    cityKey: "odesa",
    name: "Odesa Coastal Showroom",
    nameKey: "demo_odesa_coastal_showroom",
    address: "Odesa, Kanatna 14",
    addressKey: "demo_odesa_coastal_showroom_address",
    coordinates: { lat: 46.4825, lng: 30.7233 },
    phone: "+380481110005",
    workingHours: { ua: "Пн-Нд 10:00-19:00", en: "Mon-Sun 10:00-19:00" },
    isActive: true,
  },
  {
    type: "shop",
    city: "Dnipro",
    cityKey: "dnipro",
    name: "Dnipro Family Store",
    nameKey: "demo_dnipro_family_store",
    address: "Dnipro, Dmytra Yavornytskoho 54",
    addressKey: "demo_dnipro_family_store_address",
    coordinates: { lat: 48.4647, lng: 35.0462 },
    phone: "+380561110006",
    workingHours: { ua: "Пн-Нд 10:00-19:00", en: "Mon-Sun 10:00-19:00" },
    isActive: true,
  },
  {
    type: "office",
    city: "Odesa",
    cityKey: "odesa",
    name: "Odesa Service Office",
    nameKey: "demo_odesa_service_office",
    address: "Odesa, Uspenska 21",
    addressKey: "demo_odesa_service_office_address",
    coordinates: { lat: 46.4772, lng: 30.7326 },
    phone: "+380481110007",
    workingHours: { ua: "Пн-Пт 09:00-17:00", en: "Mon-Fri 09:00-17:00" },
    isActive: false,
  },
];

const userDefs = [
  {
    name: "Олена Коваль",
    email: `olena@${SEED_DOMAIN}`,
    phone: "+380500000101",
    city: "Kyiv",
    status: "active",
    homeZone: "вітальні квартири-студії",
    styleFocus: "світла тканина і м'яка посадка",
    reviewTone: "уважно дивиться на шви, колір і комфорт",
    orderPace: "планує покупку без поспіху",
  },
  {
    name: "Тарас Мельник",
    email: `taras@${SEED_DOMAIN}`,
    phone: "+380500000102",
    city: "Lviv",
    status: "active",
    homeZone: "кухні-вітальні",
    styleFocus: "натуральне дерево і практичні поверхні",
    reviewTone: "оцінює конструкцію і реальну зручність",
    orderPace: "часто бронює самовивіз",
  },
  {
    name: "Ірина Бондар",
    email: `iryna@${SEED_DOMAIN}`,
    phone: "+380500000103",
    city: "Dnipro",
    status: "active",
    homeZone: "спальні",
    styleFocus: "м'яке узголів'я і спокійні відтінки",
    reviewTone: "пише детально про тканину і висоту спинки",
    orderPace: "слідкує за графіком доставки",
  },
  {
    name: "Максим Шевчук",
    email: `maksym@${SEED_DOMAIN}`,
    phone: "+380500000104",
    city: "Odesa",
    status: "active",
    homeZone: "домашнього кабінету",
    styleFocus: "ергономіка, габарити і робочий сценарій",
    reviewTone: "звертає увагу на жорсткість, механізми й пакування",
    orderPace: "часто уточнює статуси замовлення",
  },
  {
    name: "Софія Кравець",
    email: `sofiia@${SEED_DOMAIN}`,
    phone: "+380500000105",
    city: "Kharkiv",
    status: "active",
    homeZone: "компактної гостьової кімнати",
    styleFocus: "акуратні форми і легкий візуальний силует",
    reviewTone: "цінує зовнішній вигляд у живу і точність кольору",
    orderPace: "любить заздалегідь планувати доставку",
  },
  {
    name: "Катерина Довгань",
    email: `kateryna@${SEED_DOMAIN}`,
    phone: "+380500000107",
    city: "Kyiv",
    status: "active",
    homeZone: "дитячої та сімейної зони",
    styleFocus: "зносостійка оббивка і безпечні кути",
    reviewTone: "перевіряє практичність і простоту догляду",
    orderPace: "готова брати повторно, якщо сервіс швидкий",
  },
  {
    name: "Богдан Савчук",
    email: `bohdan@${SEED_DOMAIN}`,
    phone: "+380500000108",
    city: "Lutsk",
    status: "active",
    homeZone: "їдальні приватного будинку",
    styleFocus: "стійка база і теплий відтінок дерева",
    reviewTone: "оцінює збірку, вагу і відчуття міцності",
    orderPace: "зазвичай замовляє після короткої консультації",
  },
  {
    name: "Марія Ткач",
    email: `mariia@${SEED_DOMAIN}`,
    phone: "+380500000109",
    city: "Rivne",
    status: "active",
    homeZone: "спальні з нейтральною палітрою",
    styleFocus: "текстура тканини і відчуття затишку",
    reviewTone: "пише емоційно, але предметно",
    orderPace: "уважно перевіряє бонуси і картку лояльності",
  },
  {
    name: "Роман Вербицький",
    email: `roman@${SEED_DOMAIN}`,
    phone: "+380500000110",
    city: "Cherkasy",
    status: "active",
    homeZone: "вітальні з телевізійною зоною",
    styleFocus: "глибина сидіння і габарити в розкладці",
    reviewTone: "залишає короткі, але конкретні відгуки",
    orderPace: "часто допитує про наявність на складі",
  },
  {
    name: "Наталія Лисенко",
    email: `nataliia@${SEED_DOMAIN}`,
    phone: "+380500000111",
    city: "Poltava",
    status: "active",
    homeZone: "світлої спальні",
    styleFocus: "високе узголів'я і охайний кант",
    reviewTone: "описує враження після реального користування",
    orderPace: "часто бере доставку кур'єром",
  },
  {
    name: "Владислав Мороз",
    email: `vladyslav@${SEED_DOMAIN}`,
    phone: "+380500000112",
    city: "Ternopil",
    status: "active",
    homeZone: "домашнього офісу",
    styleFocus: "зручна посадка і практична поверхня столу",
    reviewTone: "пише по суті про щоденне використання",
    orderPace: "слідкує за бонусами після завершених замовлень",
  },
  {
    name: "Юлія Климчук",
    email: `yuliia@${SEED_DOMAIN}`,
    phone: "+380500000113",
    city: "Ivano-Frankivsk",
    status: "active",
    homeZone: "передпокою та маленької вітальні",
    styleFocus: "компактність і візуальна легкість",
    reviewTone: "часто порівнює фото з реальністю",
    orderPace: "любить швидкі відповіді в чаті",
  },
  {
    name: "Дмитро Олійник",
    email: `dmytro@${SEED_DOMAIN}`,
    phone: "+380500000114",
    city: "Zhytomyr",
    status: "active",
    homeZone: "кімнати для гостей",
    styleFocus: "простий догляд і акуратна геометрія",
    reviewTone: "цінує коли все збігається по розмірах",
    orderPace: "не любить затримки в обробці замовлень",
  },
  {
    name: "Аліна Черненко",
    email: `alina@${SEED_DOMAIN}`,
    phone: "+380500000115",
    city: "Chernivtsi",
    status: "active",
    homeZone: "спальні в теплих тонах",
    styleFocus: "м'яка тканина і делікатний силует",
    reviewTone: "залишає розгорнуті відгуки після доставки",
    orderPace: "помічає кожен етап від підтвердження до вручення",
  },
  {
    name: "Андрій Гнатюк",
    email: `andrii@${SEED_DOMAIN}`,
    phone: "+380500000106",
    city: "Vinnytsia",
    status: "banned",
    homeZone: "орендованого житла",
    styleFocus: "бюджетні рішення",
    reviewTone: "не використовується в публічних сид-даних",
    orderPace: "історичний акаунт",
  },
  {
    name: "Євгенія Стеценко",
    email: `yevheniia@${SEED_DOMAIN}`,
    phone: "+380500000116",
    city: "Sumy",
    status: "banned",
    homeZone: "старої квартири",
    styleFocus: "декоративні акценти",
    reviewTone: "не використовується в публічних сид-даних",
    orderPace: "історичний акаунт",
  },
];

const REVIEW_TITLE_PATTERNS = [
  "Вдалий вибір для дому",
  "Гарно виглядає вживу",
  "Сподобалась якість матеріалу",
  "Зручніше, ніж очікували",
  "Добре вписався в кімнату",
  "Покупка без сюрпризів",
  "Акуратна збірка і форма",
  "Комфорт на кожен день",
];

const REVIEW_DELIVERY_NOTES = [
  "Доставку погодили без затримок.",
  "По статусах замовлення все було зрозуміло.",
  "Менеджер швидко підтвердив наявність.",
  "Самовивіз підготували в обіцяний день.",
  "Кур'єр попередив завчасно і все занесли акуратно.",
  "Упакування було нормальне, без пошкоджень.",
];

const REVIEW_FINISH_NOTES = [
  "Тканина виглядає дорожче, ніж на фото.",
  "Колір у реальності спокійний і не дешевить інтер'єр.",
  "Шви рівні, краї акуратні, нічого не перекошено.",
  "По габаритах усе збіглося з описом на сайті.",
  "Посадка комфортна навіть після кількох годин.",
  "Фактура матеріалу приємна і не слизька.",
];

const CHAT_CUSTOMER_PROMPTS = [
  "Підкажіть, будь ласка, чи ця модель реально є в наявності саме зараз?",
  "Чи можна зафіксувати ціну на кілька днів, поки погодимо доставку?",
  "Хочу уточнити, який зараз статус по моєму замовленню.",
  "Скажіть, будь ласка, чи спрацює моя дисконтна картка на наступне оформлення?",
  "Чи є самовивіз у моєму місті і коли можна буде забрати?",
  "Потрібно зрозуміти, чи підійде відтінок під теплу підлогу і світлі стіни.",
];

const CHAT_ADMIN_REPLIES = [
  "Перевірили склад і магазин, модель доступна. Можемо тримати резерв до кінця дня.",
  "Ціну та кошик можемо зафіксувати після підтвердження менеджером.",
  "По замовленню бачу рух у системі, зараз статус оновлюється коректно.",
  "Дисконтна картка активна, а бонуси підтягнуться після завершених замовлень.",
  "Самовивіз доступний, підготуємо товар після підтвердження часу.",
  "По кольору можу надіслати додаткові фото і уточнити фактичний відтінок тканини.",
];

const DEMO_LOCATION_TRANSLATIONS = {
  ua: {
    types: {
      showroom: "Шоурум",
      warehouse: "Склад",
      shop: "Магазин",
      office: "Офіс",
    },
    names: {
      demo_kyiv_flagship_showroom: "Флагманський шоурум Київ",
      demo_kyiv_central_warehouse: "Центральний склад Київ",
      demo_lviv_city_store: "Магазин Львів Центр",
      demo_lviv_stock_hub: "Склад Львів Хаб",
      demo_odesa_coastal_showroom: "Шоурум Одеса Узбережжя",
      demo_dnipro_family_store: "Сімейний магазин Дніпро",
      demo_odesa_service_office: "Сервісний офіс Одеса",
    },
    addresses: {
      demo_kyiv_flagship_showroom_address: "Київ, Хрещатик 12",
      demo_kyiv_central_warehouse_address: "Київ, Північна 8",
      demo_lviv_city_store_address: "Львів, Городоцька 88",
      demo_lviv_stock_hub_address: "Львів, Зелена 147",
      demo_odesa_coastal_showroom_address: "Одеса, Канатна 14",
      demo_dnipro_family_store_address: "Дніпро, Дмитра Яворницького 54",
      demo_odesa_service_office_address: "Одеса, Успенська 21",
    },
    cities: {
      kyiv: "Київ",
      lviv: "Львів",
      odesa: "Одеса",
      dnipro: "Дніпро",
    },
  },
  en: {
    types: {
      showroom: "Showroom",
      warehouse: "Warehouse",
      shop: "Shop",
      office: "Office",
    },
    names: {
      demo_kyiv_flagship_showroom: "Kyiv Flagship Showroom",
      demo_kyiv_central_warehouse: "Kyiv Central Warehouse",
      demo_lviv_city_store: "Lviv City Store",
      demo_lviv_stock_hub: "Lviv Stock Hub",
      demo_odesa_coastal_showroom: "Odesa Coastal Showroom",
      demo_dnipro_family_store: "Dnipro Family Store",
      demo_odesa_service_office: "Odesa Service Office",
    },
    addresses: {
      demo_kyiv_flagship_showroom_address: "Kyiv, Khreshchatyk 12",
      demo_kyiv_central_warehouse_address: "Kyiv, Pivnichna 8",
      demo_lviv_city_store_address: "Lviv, Horodotska 88",
      demo_lviv_stock_hub_address: "Lviv, Zelena 147",
      demo_odesa_coastal_showroom_address: "Odesa, Kanatna 14",
      demo_dnipro_family_store_address: "Dnipro, Dmytra Yavornytskoho 54",
      demo_odesa_service_office_address: "Odesa, Uspenska 21",
    },
    cities: {
      kyiv: "Kyiv",
      lviv: "Lviv",
      odesa: "Odesa",
      dnipro: "Dnipro",
    },
  },
};

const buildTranslationFieldOps = (payload = {}, mode = "set") =>
  Object.entries(payload).reduce((acc, [section, values]) => {
    Object.keys(values || {}).forEach((key) => {
      acc[`locations.${section}.${key}`] = mode === "unset" ? "" : values[key];
    });
    return acc;
  }, {});

async function clearDemoTranslations() {
  await Promise.all(
    Object.entries(DEMO_LOCATION_TRANSLATIONS).map(([lang, payload]) =>
      Translation.updateOne(
        { lang },
        { $unset: buildTranslationFieldOps(payload, "unset") },
        { upsert: false }
      )
    )
  );
}

async function syncDemoTranslations() {
  await Promise.all(
    Object.entries(DEMO_LOCATION_TRANSLATIONS).map(([lang, payload]) =>
      Translation.updateOne(
        { lang },
        { $set: buildTranslationFieldOps(payload, "set") },
        { upsert: true }
      )
    )
  );
}

async function clearDemoData() {
  const [seedUsers, seedProducts, seedLocations, seedCategories, seedOrders] = await Promise.all([
    User.find({ email: seedEmailRegex }).select("_id").lean(),
    Product.find({ slug: seedPrefixRegex }).select("_id").lean(),
    Location.find({ nameKey: seedLocationRegex }).select("_id").lean(),
    Category.find({ category: seedPrefixRegex }).select("category").lean(),
    Order.find({
      $or: [
        { comment: seedTextRegex },
        { adminNote: seedTextRegex },
        { "statusHistory.note": seedTextRegex },
      ],
    })
      .select("_id user")
      .lean(),
  ]);

  const userIds = seedUsers.map((item) => item._id);
  const userIdStrings = userIds.map((item) => String(item));
  const productIds = seedProducts.map((item) => item._id);
  const locationIds = seedLocations.map((item) => item._id);
  const categoryKeys = seedCategories.map((item) => item.category);
  const orderIds = seedOrders.map((item) => item._id);

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
        { "statusHistory.note": seedTextRegex },
      ],
    }),
    LoyaltyTransaction.deleteMany({
      $or: [{ user: { $in: userIds } }, { order: { $in: orderIds } }, { usedOrderId: { $in: orderIds } }],
    }),
    LoyaltyCard.deleteMany({ user: { $in: userIds } }),
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

  await clearDemoTranslations();
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

async function seedProducts(referenceDictionaries = {}) {
  const docs = productDefs.map((product, index) => {
    const resolvedColor = pickProductColor({
      product,
      palette: productColorPalette,
      colorLookup: productColorLookup,
    });

    const material = referenceDictionaries.materialByKey?.get(product.materialKeys?.[0] || "");
    const manufacturer = referenceDictionaries.manufacturerByKey?.get(product.manufacturerKey || "");

    return {
      name: { ua: product.nameUa, en: product.nameEn },
      description: product.description,
      slug: product.slug,
      category: product.category,
      subCategory: product.subCategory,
      typeKey: `${product.category}:${product.subCategory}`,
      images: product.images,
      previewImage: product.images?.[0] || "",
      modelUrl: buildCloudinaryModelUrl(product.slug),
      styleKeys: product.styleKeys,
      colorKeys: resolvedColor.colorKeys,
      roomKeys: product.roomKeys,
      collectionKeys: product.collectionKeys,
      featureKeys: product.featureKeys,
      dimensions: buildProductDimensions(product.specifications),
      specifications: {
        ...(product.specifications || {}),
        ...buildProductDimensions(product.specifications),
        ...(material ? { material: material._id } : {}),
        ...(manufacturer ? { manufacturer: manufacturer._id } : {}),
        materialKey: product.materialKeys?.[0] || "",
        materialKeys: product.materialKeys || [],
        materials: (product.materialKeys || []).map((key) => ({ key, label: key.replace(/_/g, " ") })),
        manufacturerKey: product.manufacturerKey || "",
        countryOfOrigin: "Ukraine",
        warrantyMonths: 24,
        leadTimeDays: product.specifications?.leadTimeDays || 5 + (index % 6),
      },
      price: product.price,
      discount: product.discount,
      inStock: true,
      stockQty: 0,
      status: "active",
      ratingAvg: 0,
      ratingCount: 0,
      createdAt: daysAgo(160 - index * 4),
      updatedAt: daysAgo(12 - (index % 8)),
    };
  });

  return Product.insertMany(docs);
}

async function seedUsers(passwordHash) {
  const loyaltyByIndex = [
    { tier: "gold", baseDiscountPct: 5 },
    { tier: "silver", baseDiscountPct: 3 },
    { tier: "none", baseDiscountPct: 0 },
    { tier: "silver", baseDiscountPct: 3 },
    { tier: "gold", baseDiscountPct: 5 },
    { tier: "none", baseDiscountPct: 0 },
  ];

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
    addresses:
      user.status === "active"
        ? [
            {
              id: `addr-${index + 1}-home`,
              label: "Home",
              city: user.city,
              addressLine: `${user.city}, вул. Демонстраційна ${index + 10}`,
              comment: `[${SEED_TAG}] Основна адреса клієнта`,
              isPrimary: true,
            },
            {
              id: `addr-${index + 1}-work`,
              label: "Office",
              city: user.city,
              addressLine: `${user.city}, вул. Бізнесова ${index + 20}`,
              comment: `[${SEED_TAG}] Додаткова адреса для доставки`,
              isPrimary: false,
            },
          ]
        : [],
    rewards: [],
    loyalty: {
      cardNumber: buildCardNumber(index),
      tier: loyaltyByIndex[index % loyaltyByIndex.length].tier,
      baseDiscountPct: loyaltyByIndex[index % loyaltyByIndex.length].baseDiscountPct,
      bonusBalance: 0,
      totalEarned: 0,
      totalRedeemed: 0,
      totalExpired: 0,
      totalSpent: 0,
      completedOrders: 0,
      lastOrderAt: index < 5 ? daysAgo(20 - index * 2) : null,
      notes: `[${SEED_TAG}] ${user.orderPace}`,
      manualOverride: false,
    },
    isAiAssistant: false,
    isOnline: index < 3,
    presence: index < 3 ? "online" : index < 6 ? "away" : "offline",
    lastSeen: index < 3 ? daysAgo(0, 12 + index) : daysAgo(2 + index),
    lastActivityAt: index < 3 ? daysAgo(0, 12 + index) : daysAgo(2 + index),
    lastLoginAt: daysAgo(1 + index),
    lastPage: index < 4 ? `/catalog/${["sofas", "beds", "chairs", "tables"][index % 4]}` : "/catalog",
    createdAt: daysAgo(140 - index * 7),
    updatedAt: daysAgo(5 - (index % 5)),
  }));

  await User.collection.insertMany(docs);

  const inserted = await User.find({ email: { $in: userDefs.map((user) => user.email) } })
    .select("+passwordHash")
    .lean();
  const insertedByEmail = new Map(inserted.map((doc) => [doc.email, doc]));

  return userDefs.map((definition) => ({
    ...(insertedByEmail.get(definition.email) || {}),
    seedProfile: definition,
  }));
}

async function seedLikes(users, products) {
  const likeDocs = [];
  const bulkOps = [];

  users
    .filter((user) => user.status === "active")
    .forEach((user, index) => {
      const likedProducts = Array.from(
        new Map(
          [
            products[(index * 2) % products.length],
            products[(index * 2 + 3) % products.length],
            products[(index * 2 + 7) % products.length],
            products[(index * 2 + 11) % products.length],
          ].map((product) => [String(product._id), product])
        ).values()
      );

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
        createdAt: daysAgo(Math.max(1, 12 - index)),
        updatedAt: daysAgo(Math.max(0, 4 - index)),
      });
    });
    });

  await Promise.all([User.bulkWrite(bulkOps), Like.insertMany(likeDocs)]);
}

async function seedCarts(users, products) {
  const docs = users.slice(0, 6).map((user, index) => ({
    user: user._id,
    items: [
      { product: products[index]._id, qty: 1 + (index % 2) },
      { product: products[index + 2]._id, qty: 1 },
      { product: products[(index + 7) % products.length]._id, qty: 1 + (index % 3 === 0 ? 1 : 0) },
    ],
    createdAt: daysAgo(Math.max(1, 8 - index)),
    updatedAt: daysAgo(index),
  }));

  await Cart.insertMany(docs);
}

async function seedInventory(products, locations, admin) {
  const warehouses = locations.filter((location) => location.type === "warehouse");
  const salesPoints = locations.filter((location) => ["showroom", "shop"].includes(location.type));
  const rows = [];
  const movements = [];

  products.forEach((product, index) => {
    const primaryWarehouse = warehouses[index % warehouses.length];
    const primarySalesPoint = salesPoints[index % salesPoints.length];
    const secondarySalesPoint = salesPoints[(index + 2) % salesPoints.length];
    const locationPool = [primaryWarehouse, primarySalesPoint];

    if (index % 3 === 0 && secondarySalesPoint?._id && String(secondarySalesPoint._id) !== String(primarySalesPoint._id)) {
      locationPool.push(secondarySalesPoint);
    }

    locationPool.forEach((location, rowIndex) => {
      const onHand = Math.max(0, 4 + ((index + 3) * (rowIndex + 2)) % 15);
      const reserved = Math.min(onHand, (index + rowIndex) % 4);
      const isShowcase = rowIndex === 1 && location.type !== "warehouse" && index % 3 === 0;
      const zone =
        rowIndex === 0
          ? `WH-${String((index % 5) + 1).padStart(2, "0")}`
          : isShowcase
            ? "SHOW"
            : `SHOP-${String((index % 4) + 1).padStart(2, "0")}`;

      rows.push({
        product: product._id,
        productId: product._id,
        location: location._id,
        locationId: location._id,
        onHand,
        reserved,
        zone,
        note: `[${SEED_TAG}] Demo inventory row for ${location.city}`,
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
        zone,
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

const buildOrderStatusHistory = ({ status, createdAt, city, adminId = null }) => {
  const history = [
    {
      status: "new",
      changedAt: createdAt,
      changedBy: null,
      note: `[${SEED_TAG}] Замовлення створено клієнтом`,
    },
  ];

  if (status === "new") return history;

  history.push({
    status: "confirmed",
    changedAt: addHours(createdAt, 4),
    changedBy: adminId,
    note: `[${SEED_TAG}] Менеджер підтвердив замовлення`,
  });

  if (status === "confirmed") return history;
  if (status === "cancelled") {
    history.push({
      status: "cancelled",
      changedAt: addHours(createdAt, 18),
      changedBy: adminId,
      note: `[${SEED_TAG}] Клієнт переніс покупку до кращого бюджету`,
    });
    return history;
  }

  history.push({
    status: "processing",
    changedAt: addHours(createdAt, 18),
    changedBy: adminId,
    note: `[${SEED_TAG}] Замовлення передано в обробку для міста ${city}`,
  });

  if (status === "processing") return history;

  history.push({
    status: "shipped",
    changedAt: addHours(createdAt, 42),
    changedBy: adminId,
    note: `[${SEED_TAG}] Передано у доставку або видано на самовивіз`,
  });

  if (status === "shipped") return history;

  history.push({
    status: "completed",
    changedAt: addHours(createdAt, 78),
    changedBy: adminId,
    note: `[${SEED_TAG}] Замовлення успішно завершене`,
  });

  return history;
};

async function seedOrders(users, products, locations, admin) {
  const activeUsers = users.filter((user) => user.status === "active");
  const pickupLocations = locations.filter((location) => ["showroom", "shop"].includes(location.type));
  const statusCycle = [
    "completed",
    "shipped",
    "processing",
    "confirmed",
    "new",
    "cancelled",
    "completed",
    "processing",
    "completed",
    "confirmed",
    "completed",
    "shipped",
  ];
  const totalOrders = Math.max(54, activeUsers.length * 4);

  const docs = Array.from({ length: totalOrders }, (_item, index) => {
    const status = statusCycle[index % statusCycle.length];
    const user = activeUsers[index % activeUsers.length];
    const itemCount = 1 + (index % 3);
    const methodIndex = index % 3;
    const selectedProducts = Array.from({ length: itemCount }, (_entry, itemIndex) =>
      products[(index * 3 + itemIndex * 5) % products.length]
    );

    const items = selectedProducts.map((product, itemIndex) => {
      const qty = 1 + ((index + itemIndex) % 2);
      const price = computeDiscountedPrice(product);

      return {
        productId: product._id,
        name: product.name.ua,
        qty,
        price,
        sku: `${product.slug.toUpperCase().slice(0, 18)}-${itemIndex + 1}`,
        image: product.images?.[0] || "",
      };
    });

    const subtotal = roundMoney(items.reduce((sum, item) => sum + item.qty * item.price, 0));
    const pickupLocation = pickupLocations[index % pickupLocations.length];
    const method = methodIndex === 0 ? "pickup" : methodIndex === 1 ? "courier" : "nova_poshta";
    const createdAt = daysAgo(Math.max(1, 118 - index * 2), 9 + (index % 6));
    const loyaltyDiscount = roundMoney(
      subtotal * Math.max(0, Number(user.loyalty?.baseDiscountPct || 0)) / 100
    );
    const rewardDiscount = 0;
    const totalSavings = roundMoney(loyaltyDiscount + rewardDiscount);
    const cartTotal = roundMoney(Math.max(0, subtotal - totalSavings));
    const statusHistory = buildOrderStatusHistory({
      status,
      createdAt,
      city: user.city,
      adminId: admin?._id || null,
    });
    const lastStatus = statusHistory[statusHistory.length - 1];

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
        address: method === "courier" ? `${user.city}, вул. Клієнтська ${index + 3}` : "",
        npOffice: method === "nova_poshta" ? `Відділення ${index + 1}` : "",
      },
      comment: `[${SEED_TAG}] ${user.name}: ${selectedProducts.map((product) => product.name.ua).join(", ")}`,
      items,
      totals: {
        subtotal,
        loyaltyDiscount,
        rewardDiscount,
        totalSavings,
        cartTotal,
      },
      loyaltySnapshot: {
        cardNumber: user.loyalty?.cardNumber || buildCardNumber(index % activeUsers.length),
        tier: user.loyalty?.tier || "none",
        baseDiscountPct: Number(user.loyalty?.baseDiscountPct || 0),
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
        status === "confirmed" || status === "processing" || status === "shipped"
          ? new Date(createdAt.getTime() + ((index % 4) + 1) * 24 * 60 * 60 * 1000)
          : null,
      adminNote:
        status === "cancelled"
          ? `[${SEED_TAG}] Клієнт поставив покупку на паузу`
          : status === "processing" || status === "shipped"
            ? `[${SEED_TAG}] Пріоритетна обробка для міста ${user.city}`
            : status === "completed"
              ? `[${SEED_TAG}] Продаж завершено без претензій`
              : "",
      assignedTo:
        status === "processing" || status === "shipped" || status === "completed"
          ? admin?._id || null
          : null,
      statusHistory,
      cancelledAt: status === "cancelled" ? lastStatus.changedAt : null,
      createdAt,
      updatedAt: lastStatus.changedAt,
    };
  });

  const inserted = await Order.insertMany(docs);
  const ordersByUser = inserted.reduce((acc, order) => {
    const key = String(order.user);
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key).push(order._id);
    return acc;
  }, new Map());

  await User.bulkWrite(
    Array.from(ordersByUser.entries()).map(([userId, orderIds]) => ({
      updateOne: {
        filter: { _id: userId },
        update: { $set: { orders: orderIds } },
      },
    }))
  );

  return inserted.map((order) => (order?.toObject ? order.toObject() : order));
}

async function seedLegacyRewards(users, orders) {
  const completedOrdersByUser = orders.reduce((acc, order) => {
    if (order.status !== "completed") return acc;
    const key = String(order.user);
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key).push(order);
    return acc;
  }, new Map());

  const updates = users
    .filter((user) => user.status === "active")
    .map((user, index) => {
      const completedOrders = completedOrdersByUser.get(String(user._id)) || [];
      const latestCompletedOrder = completedOrders.at(-1) || null;
      const rewards = [
        {
          rewardId: `legacy-active-${index + 1}`,
          type: "next_order_discount",
          title: "Персональна знижка на наступне замовлення",
          description: `[${SEED_TAG}] Разова знижка для активного клієнта`,
          discountPct: 0,
          amountOff: 500 + (index % 4) * 250,
          minOrderTotal: 7000 + (index % 3) * 2000,
          status: "active",
          issuedAt: daysAgo(8 + index),
          expiresAt: daysAhead(20 + index),
          usedAt: null,
          usedOrderId: null,
          note: `[${SEED_TAG}] Автоматичний сид для перевірки checkout`,
        },
      ];

      if (index % 2 === 0) {
        rewards.push({
          rewardId: `legacy-expired-${index + 1}`,
          type: "manual_discount",
          title: "Сезонна пропозиція",
          description: `[${SEED_TAG}] Історична акція з вичерпаним терміном`,
          discountPct: 10,
          amountOff: 0,
          minOrderTotal: 12000,
          status: "expired",
          issuedAt: daysAgo(55 + index),
          expiresAt: daysAgo(5 + index),
          usedAt: null,
          usedOrderId: null,
          note: `[${SEED_TAG}] Прострочена винагорода`,
        });
      }

      if (latestCompletedOrder && index % 3 === 0) {
        rewards.push({
          rewardId: `legacy-used-${index + 1}`,
          type: "manual_discount",
          title: "Компенсація за повторну покупку",
          description: `[${SEED_TAG}] Використана винагорода в історії клієнта`,
          discountPct: 0,
          amountOff: 900 + (index % 3) * 150,
          minOrderTotal: 0,
          status: "used",
          issuedAt: daysAgo(35 + index),
          expiresAt: daysAhead(12 + index),
          usedAt: addHours(latestCompletedOrder.updatedAt || latestCompletedOrder.createdAt, 2),
          usedOrderId: latestCompletedOrder._id,
          note: `[${SEED_TAG}] Уже списана винагорода`,
        });
      }

      return {
        updateOne: {
          filter: { _id: user._id },
          update: { $set: { rewards } },
        },
      };
    });

  if (!updates.length) return;
  await User.bulkWrite(updates);
}

async function seedLoyaltyArtifacts(users, orders) {
  const completedOrders = orders
    .filter((order) => order.status === "completed")
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  for (const order of completedOrders) {
    await syncOrderLoyaltyEffects(order);
  }

  await seedLegacyRewards(users, orders);
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

const buildReviewText = ({ user, product, productIndex, reviewIndex, rating }) => {
  const profile = user.seedProfile || {};
  const firstName = getFirstName(user.name);
  const finishNote = REVIEW_FINISH_NOTES[(productIndex + reviewIndex) % REVIEW_FINISH_NOTES.length];
  const deliveryNote = REVIEW_DELIVERY_NOTES[(productIndex * 2 + reviewIndex) % REVIEW_DELIVERY_NOTES.length];
  const toneNote =
    rating >= 5
      ? "Після кількох днів користування враження дуже хороше, модель виглядає зібрано і дорого."
      : rating === 4
        ? "Є дрібні нюанси по відчуттю жорсткості, але в цілому покупкою задоволені."
        : "Потрібно уважно дивитися на свої розміри кімнати, але база по якості цілком нормальна.";

  return (
    `${firstName}, ${user.city}. Для ${profile.homeZone || "домашнього інтер'єру"} обрали ` +
    `${product.name.ua}. Найбільше сподобалось, що тут відчувається ${profile.styleFocus || "хороший баланс форми і комфорту"}. ` +
    `${finishNote} ${deliveryNote} ${toneNote} ${profile.reviewTone || ""}`.trim()
  );
};

async function seedReviews(users, products) {
  const activeUsers = users.filter((user) => user.status === "active");

  const docs = products.flatMap((product, productIndex) => {
    const reviewsPerProduct = Math.min(activeUsers.length, 4 + (productIndex % 4));

    return Array.from({ length: reviewsPerProduct }, (_item, reviewIndex) => {
      const ratingCycle = [5, 4, 5, 5, 4, 5, 3];
      const rating = ratingCycle[(productIndex + reviewIndex) % ratingCycle.length];
      const user = activeUsers[(productIndex * 2 + reviewIndex) % activeUsers.length];
      const createdAt = daysAgo(95 - productIndex * 2 - reviewIndex, 10 + (reviewIndex % 6));

      return {
        product: product._id,
        user: user._id,
        rating,
        title: REVIEW_TITLE_PATTERNS[(productIndex + reviewIndex) % REVIEW_TITLE_PATTERNS.length],
        text: buildReviewText({ user, product, productIndex, reviewIndex, rating }),
        isApproved: true,
        createdAt,
        updatedAt: new Date(createdAt.getTime() + 2 * 60 * 60 * 1000),
      };
    });
  });

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

async function seedMessages(users, admin, products, orders) {
  const adminId = String(admin._id);
  const ordersByUser = orders.reduce((acc, order) => {
    const key = String(order.user);
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key).push(order);
    return acc;
  }, new Map());

  const docs = users
    .filter((user) => user.status === "active")
    .flatMap((user, index) => {
      const userId = String(user._id);
      const baseDate = daysAgo(Math.max(1, 16 - index), 10 + (index % 6));
      const featuredProduct = products[(index * 3) % products.length];
      const alternateProduct = products[(index * 3 + 5) % products.length];
      const latestOrder = (ordersByUser.get(userId) || [])
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      const loyaltyCard = user.loyalty?.cardNumber || buildCardNumber(index);
      const latestOrderStatus = latestOrder?.status || "new";
      const firstName = getFirstName(user.name);

      return [
        {
          sender: userId,
          receiver: adminId,
          text:
            `${CHAT_CUSTOMER_PROMPTS[index % CHAT_CUSTOMER_PROMPTS.length]} ` +
            `Цікавить товар "${featuredProduct.name.ua}" для ${user.seedProfile?.homeZone || "квартири"}.`,
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
          text:
            `${CHAT_ADMIN_REPLIES[index % CHAT_ADMIN_REPLIES.length]} ` +
            `По "${featuredProduct.name.ua}" можемо зорієнтувати ще й по кольору та строках.`,
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
          text:
            `Дякую. Ще підкажіть по замовленню ${index + 1}: зараз у мене в історії статус ` +
            `"${latestOrderStatus}". Хочу зрозуміти, коли краще чекати рух.`,
          isGuest: false,
          guestName: "",
          isRead: index % 2 === 0,
          source: "human",
          meta: { seedTag: SEED_TAG },
          createdAt: new Date(baseDate.getTime() + 50 * 60 * 1000),
          updatedAt: new Date(baseDate.getTime() + 50 * 60 * 1000),
        },
        {
          sender: adminId,
          receiver: userId,
          text:
            `${firstName}, бачу ваше замовлення і картку ${loyaltyCard}. ` +
            `Після завершених покупок бонуси підтягнуться автоматично, а по "${alternateProduct.name.ua}" ` +
            `можемо окремо перевірити склад і самовивіз.`,
          isGuest: false,
          guestName: "",
          isRead: index % 3 !== 0,
          source: "human",
          meta: { seedTag: SEED_TAG },
          createdAt: new Date(baseDate.getTime() + 80 * 60 * 1000),
          updatedAt: new Date(baseDate.getTime() + 80 * 60 * 1000),
        },
        {
          sender: userId,
          receiver: adminId,
          text:
            `Добре, тоді залиште, будь ласка, нотатку що для мене важливі ` +
            `${user.seedProfile?.styleFocus || "точний колір і габарити"}. Якщо буде оновлення по статусу, напишіть сюди.`,
          isGuest: false,
          guestName: "",
          isRead: index % 4 !== 0,
          source: "human",
          meta: { seedTag: SEED_TAG },
          createdAt: new Date(baseDate.getTime() + 120 * 60 * 1000),
          updatedAt: new Date(baseDate.getTime() + 120 * 60 * 1000),
        },
        {
          sender: adminId,
          receiver: userId,
          text:
            `Нотатку додали. Коли статус зміниться, чат оновиться автоматично. ` +
            `Також зафіксували побажання щодо "${featuredProduct.name.ua}" і доставки в ${user.city}.`,
          isGuest: false,
          guestName: "",
          isRead: index % 3 !== 0,
          source: "human",
          meta: { seedTag: SEED_TAG },
          createdAt: new Date(baseDate.getTime() + 145 * 60 * 1000),
          updatedAt: new Date(baseDate.getTime() + 145 * 60 * 1000),
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
  const referenceDictionaries = await seedReferenceDictionaries();
  const [locations, products, users] = await Promise.all([
    seedLocations(),
    seedProducts(referenceDictionaries),
    seedUsers(passwordHash),
  ]);
  await syncDemoTranslations();

  await seedInventory(products, locations, admin);
  await seedLikes(users, products);
  await seedCarts(users, products);
  const orders = await seedOrders(users, products, locations, admin);
  await seedLoyaltyArtifacts(users, orders);
  const loyaltyUsers = await syncSeedUsers(users);
  await syncOrderLoyaltySnapshots(loyaltyUsers);
  await seedReviews(users, products);
  await seedMessages(users, admin, products, orders);

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
      loyaltyCards: await LoyaltyCard.countDocuments({ user: { $in: users.map((user) => user._id) } }),
      loyaltyTransactions: await LoyaltyTransaction.countDocuments({
        user: { $in: users.map((user) => user._id) },
      }),
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
