import dotenv from "dotenv";
import mongoose from "mongoose";

import Category from "../models/Category.js";
import Product from "../models/Product.js";
import SubCategory from "../models/SubCategory.js";

dotenv.config();

if (!process.env.MONGO_URI) {
  throw new Error("MONGO_URI is required in .env");
}

const localized = (ua, en) => ({ ua, en });

const placeholderImage = (label) =>
  `https://placehold.co/1200x900/e9eef3/1f2937?text=${encodeURIComponent(label)}`;

const catalogImages = {
  mirrors:
    "https://res.cloudinary.com/dauuk7ab8/image/upload/v1775844979/332bd119-93bc-4aff-a1f1-fd5ecd6a624d_wifgjd.jpg",
  beds:
    "https://res.cloudinary.com/dauuk7ab8/image/upload/v1775844549/29ff9063-44c7-45a6-87be-fb585c9be6a1_qwf5gg.jpg",
  tablesAndChairs:
    "https://res.cloudinary.com/dauuk7ab8/image/upload/v1775843382/1d2c177f-9f32-4f1f-bea3-3cbeea8af595_xfouyz.jpg",
  sofas:
    "https://res.cloudinary.com/dauuk7ab8/image/upload/v1775843114/fa42cfd7-ac0d-41c1-aa50-a614f4f25526_hsycrq.jpg",
  armchairs:
    "https://res.cloudinary.com/dauuk7ab8/image/upload/v1775842814/c9579047-793e-4472-a59d-f96dcef3f2bb_qcxot8.jpg",
};

const categorySeeds = [
  {
    key: "beds",
    ua: "Ліжка",
    en: "Beds",
    image: catalogImages.beds,
    summaryUa: "Ліжка для основної, гостьової та дитячої спальні.",
    summaryEn: "Bed solutions for primary, guest, and kids' bedrooms.",
    children: [
      ["single", "Односпальні", "Single Beds"],
      ["double", "Двоспальні", "Double Beds"],
      ["queen", "Полуторні", "Queen Beds"],
      ["king", "King-size", "King-Size Beds"],
      ["kids", "Дитячі", "Kids Beds"],
      ["bunk", "Двоярусні", "Bunk Beds"],
      ["storage", "З підйомним механізмом", "Storage Beds"],
      ["upholstered", "М'які ліжка", "Upholstered Beds"],
    ],
  },
  {
    key: "sofas",
    ua: "Дивани",
    en: "Sofas",
    image: catalogImages.sofas,
    summaryUa: "Дивани для вітальні, лаунж-зон і багатофункціональних просторів.",
    summaryEn: "Sofas for living rooms, lounge zones, and multifunctional interiors.",
    children: [
      ["straight", "Прямі", "Straight Sofas"],
      ["corner", "Кутові", "Corner Sofas"],
      ["modular", "Модульні", "Modular Sofas"],
      ["sofa-bed", "Дивани-ліжка", "Sofa Beds"],
      ["recliner", "З реклайнером", "Recliner Sofas"],
      ["loveseat", "Двомісні", "Loveseats"],
    ],
  },
  {
    key: "armchairs",
    ua: "Крісла",
    en: "Armchairs",
    image: catalogImages.armchairs,
    summaryUa: "Крісла для житлових, офісних та акцентних зон.",
    summaryEn: "Armchairs for residential, office, and accent spaces.",
    children: [
      ["classic", "Класичні", "Classic Armchairs"],
      ["modern", "Сучасні", "Modern Armchairs"],
      ["recliner", "Розкладні", "Recliner Armchairs"],
      ["accent", "Декоративні", "Accent Armchairs"],
      ["office", "Офісні", "Office Armchairs"],
      ["lounge", "Лаунж", "Lounge Armchairs"],
    ],
  },
  {
    key: "tables",
    ua: "Столи",
    en: "Tables",
    image: catalogImages.tablesAndChairs,
    summaryUa: "Столи для їдальні, кухні, вітальні та робочих зон.",
    summaryEn: "Tables for dining, kitchen, living, and work zones.",
    children: [
      ["dining", "Обідні", "Dining Tables"],
      ["coffee", "Журнальні", "Coffee Tables"],
      ["desk", "Письмові", "Desk Tables"],
      ["console", "Консольні", "Console Tables"],
      ["kitchen", "Кухонні", "Kitchen Tables"],
      ["side", "Приставні", "Side Tables"],
    ],
  },
  {
    key: "chairs",
    ua: "Стільці",
    en: "Chairs",
    image: catalogImages.tablesAndChairs,
    summaryUa: "Стільці для кухні, їдальні, офісу та комерційних просторів.",
    summaryEn: "Chairs for kitchens, dining rooms, offices, and commercial interiors.",
    children: [
      ["dining", "Кухонні", "Dining Chairs"],
      ["bar", "Барні", "Bar Chairs"],
      ["office", "Офісні", "Office Chairs"],
      ["wooden", "Дерев'яні", "Wooden Chairs"],
      ["soft", "М'які", "Soft Chairs"],
      ["designer", "Дизайнерські", "Designer Chairs"],
    ],
  },
  {
    key: "commodes",
    ua: "Тумби та комоди",
    en: "Commodes & Cabinets",
    image: catalogImages.mirrors,
    summaryUa: "Компактне та середнє зберігання для спальні, вітальні та передпокою.",
    summaryEn: "Compact and mid-size storage for bedrooms, living rooms, and hallways.",
    children: [
      ["commode", "Комоди", "Commodes"],
      ["bedside", "Приліжкові", "Bedside Tables"],
      ["tv-stand", "Під телевізор", "TV Stands"],
      ["console", "Консольні", "Console Cabinets"],
      ["cabinet", "Тумби для зберігання", "Storage Cabinets"],
    ],
  },
  {
    key: "wardrobes",
    ua: "Шафи",
    en: "Wardrobes",
    image: catalogImages.beds,
    summaryUa: "Шафи для одягу, текстилю та гардеробних рішень.",
    summaryEn: "Wardrobe solutions for clothing, textiles, and storage planning.",
    children: [
      ["hinged", "Розпашні", "Hinged Wardrobes"],
      ["sliding", "Шафи-купе", "Sliding Wardrobes"],
      ["built-in", "Вбудовані", "Built-In Wardrobes"],
      ["corner", "Кутові", "Corner Wardrobes"],
      ["modular", "Модульні", "Modular Wardrobes"],
    ],
  },
  {
    key: "bedroom",
    ua: "Спальня",
    en: "Bedroom",
    image: catalogImages.beds,
    summaryUa: "Кімнатна категорія для побудови цілісного асортименту спальні.",
    summaryEn: "Room-based category for building a complete bedroom assortment.",
    children: [
      ["beds", "Ліжка", "Beds"],
      ["bedside", "Тумби", "Bedside"],
      ["wardrobes", "Шафи", "Wardrobes"],
      ["dressers", "Комоди", "Dressers"],
      ["sets", "Гарнітури", "Bedroom Sets"],
    ],
  },
  {
    key: "living-room",
    ua: "Вітальня",
    en: "Living Room",
    image: catalogImages.sofas,
    summaryUa: "Кімнатна категорія для основної житлової зони.",
    summaryEn: "Room-based category for the main living zone.",
    children: [
      ["sofas", "Дивани", "Sofas"],
      ["armchairs", "Крісла", "Armchairs"],
      ["tables", "Столики", "Tables"],
      ["tv-stands", "ТВ тумби", "TV Stands"],
      ["shelves", "Полиці", "Shelves"],
    ],
  },
  {
    key: "kitchen",
    ua: "Кухня",
    en: "Kitchen",
    image: catalogImages.tablesAndChairs,
    summaryUa: "Кімнатна категорія для меблів кухні та обідньої зони.",
    summaryEn: "Room category for kitchen and dining furniture.",
    children: [
      ["tables", "Столи", "Tables"],
      ["chairs", "Стільці", "Chairs"],
      ["cabinets", "Кухонні шафи", "Kitchen Cabinets"],
      ["bar", "Барні стійки", "Bar Counters"],
    ],
  },
  {
    key: "office",
    ua: "Офіс",
    en: "Office",
    image: catalogImages.armchairs,
    summaryUa: "Кімнатна категорія для офісних і домашніх робочих просторів.",
    summaryEn: "Room category for office and home-work environments.",
    children: [
      ["desks", "Столи", "Desks"],
      ["chairs", "Крісла", "Chairs"],
      ["cabinets", "Шафи", "Cabinets"],
      ["storage", "Тумби", "Storage"],
    ],
  },
  {
    key: "kids",
    ua: "Дитячі",
    en: "Kids",
    image: catalogImages.beds,
    summaryUa: "Кімнатна категорія для дитячих меблів із фокусом на безпеку та ергономіку.",
    summaryEn: "Room category for kids furniture with a focus on safety and ergonomics.",
    children: [
      ["beds", "Ліжка", "Beds"],
      ["desks", "Столи", "Desks"],
      ["wardrobes", "Шафи", "Wardrobes"],
      ["chairs", "Стільці", "Chairs"],
    ],
  },
  {
    key: "outdoor",
    ua: "Садові меблі",
    en: "Outdoor",
    image: catalogImages.tablesAndChairs,
    summaryUa: "Категорія меблів для терас, балконів, саду та відкритих зон відпочинку.",
    summaryEn: "Furniture for terraces, balconies, gardens, and outdoor leisure areas.",
    children: [
      ["tables", "Столи", "Outdoor Tables"],
      ["chairs", "Стільці", "Outdoor Chairs"],
      ["sofas", "Дивани", "Outdoor Sofas"],
      ["loungers", "Шезлонги", "Loungers"],
    ],
  },
];

const allowedChildren = new Map(
  categorySeeds.map((category) => [category.key, new Set(category.children.map(([key]) => key))])
);

const normalizeKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const buildChildDescription = (childUa, childEn, parentUa, parentEn) =>
  localized(
    `Підкатегорія ${childUa} у розділі ${parentUa} для точної навігації та фільтрації.`,
    `${childEn} subcategory inside ${parentEn} for precise catalog navigation and filtering.`
  );

const buildCategoryDocs = () =>
  categorySeeds.map((category, index) => ({
    category: category.key,
    names: localized(category.ua, category.en),
    description: localized(category.summaryUa, category.summaryEn),
    image: category.image || placeholderImage(category.en),
    order: index + 1,
    children: category.children.map(([key, ua, en], childIndex) => ({
      key,
      names: localized(ua, en),
      description: buildChildDescription(ua, en, category.ua, category.en),
      image: category.image || placeholderImage(en),
      order: childIndex + 1,
    })),
    folderPath: `__catalog-reset/${category.key}`,
  }));

const buildSubcategoryDocs = () =>
  categorySeeds.flatMap((category) =>
    category.children.map(([key, ua, en], childIndex) => ({
      categoryKey: category.key,
      key,
      name: localized(ua, en),
      description: buildChildDescription(ua, en, category.ua, category.en),
      sort: childIndex + 1,
      isActive: true,
    }))
  );

const toTarget = (category, subCategory) => {
  const nextCategory = normalizeKey(category);
  const nextSubcategory = normalizeKey(subCategory);
  if (!allowedChildren.has(nextCategory)) return null;
  if (!allowedChildren.get(nextCategory).has(nextSubcategory)) return null;
  return { category: nextCategory, subCategory: nextSubcategory };
};

const inferProductCatalog = (product) => {
  const category = normalizeKey(product.category);
  const subCategory = normalizeKey(product.subCategory);
  const text = [product.slug, product.name?.ua, product.name?.en]
    .map((item) => String(item || "").toLowerCase())
    .join(" ");

  const direct = toTarget(category, subCategory);
  if (direct) return direct;

  if (category === "demo-beds") {
    return toTarget("beds", subCategory === "soft" ? "upholstered" : subCategory);
  }

  if (category === "demo-sofas") {
    return toTarget("sofas", subCategory);
  }

  if (category === "demo-chairs") {
    if (subCategory === "dining-chair") return toTarget("chairs", "dining");
    if (subCategory === "office-chair") return toTarget("chairs", "office");
    if (subCategory === "armchair") return toTarget("armchairs", "modern");
  }

  if (category === "demo-tables") {
    return toTarget("tables", subCategory === "desk" ? "desk" : subCategory);
  }

  if (category === "dressers") return toTarget("commodes", "commode");
  if (category === "nightstands") return toTarget("commodes", "bedside");
  if (category === "tvstands") return toTarget("commodes", "tv-stand");
  if (category === "cabinets") return toTarget("commodes", "cabinet");
  if (category === "bookcases" || category === "shelves") return toTarget("living-room", "shelves");
  if (category === "ottomans") return toTarget("armchairs", "accent");

  if (category === "beds") {
    if (subCategory === "soft") return toTarget("beds", "upholstered");
    if (/queen/.test(text)) return toTarget("beds", "queen");
    if (/king/.test(text)) return toTarget("beds", "king");
    if (/(kids|дит)/.test(text)) return toTarget("beds", "kids");
    if (/(bunk|двоярус)/.test(text)) return toTarget("beds", "bunk");
    if (/(storage|підйом)/.test(text)) return toTarget("beds", "storage");
    if (/(soft|upholstered|м'як)/.test(text)) return toTarget("beds", "upholstered");
    if (/(single|односп)/.test(text)) return toTarget("beds", "single");
    if (/(double|двосп)/.test(text)) return toTarget("beds", "double");
  }

  if (category === "sofas") {
    if (/(sofa-bed|sofabed)/.test(subCategory) || /(sofa bed|диван-ліж)/.test(text)) {
      return toTarget("sofas", "sofa-bed");
    }
    if (subCategory === "corner" && /(straight|прям)/.test(text)) return toTarget("sofas", "straight");
    if (/(loveseat|двоміс)/.test(text)) return toTarget("sofas", "loveseat");
    return toTarget("sofas", subCategory);
  }

  if (category === "tables") {
    if (subCategory === "computer") return toTarget("tables", "desk");
    return toTarget("tables", subCategory);
  }

  if (category === "chairs") {
    if (/(designer|дизайнер)/.test(text)) return toTarget("chairs", "designer");
    if (/(wood|oak|ash|walnut|дерев|бук)/.test(text)) return toTarget("chairs", "wooden");
    if (/(soft|м'як|upholster|fabric|velvet)/.test(text)) return toTarget("chairs", "soft");
    return toTarget("chairs", subCategory || "dining");
  }

  if (category === "wardrobes") {
    if (subCategory === "swing") return toTarget("wardrobes", "hinged");
    return toTarget("wardrobes", subCategory || "hinged");
  }

  if (category === "armchairs") {
    return toTarget("armchairs", subCategory || "modern");
  }

  return null;
};

const isCoveredByCatalog = (product) => !!toTarget(product.category, product.subCategory);

async function resetCatalogCollections() {
  await Promise.all([Category.deleteMany({}), SubCategory.deleteMany({})]);
  await Category.insertMany(buildCategoryDocs());
  await SubCategory.insertMany(buildSubcategoryDocs());
}

async function migrateProducts() {
  const products = await Product.find({}).select("_id slug name category subCategory").lean();
  const bulkOps = [];
  const migrated = [];
  const unresolved = [];

  for (const product of products) {
    const target = inferProductCatalog(product);
    if (!target) {
      unresolved.push({
        slug: product.slug || "",
        name: product.name?.ua || product.name?.en || "",
        category: product.category || "",
        subCategory: product.subCategory || "",
      });
      continue;
    }

    bulkOps.push({
      updateOne: {
        filter: { _id: product._id },
        update: {
          $set: {
            category: target.category,
            subCategory: target.subCategory,
            typeKey: `${target.category}:${target.subCategory}`,
          },
        },
      },
    });

    if (
      String(product.category || "") !== target.category ||
      String(product.subCategory || "") !== target.subCategory
    ) {
      migrated.push({
        slug: product.slug || "",
        from: `${product.category || ""}:${product.subCategory || ""}`,
        to: `${target.category}:${target.subCategory}`,
      });
    }
  }

  if (bulkOps.length) {
    await Product.bulkWrite(bulkOps);
  }

  const uncoveredAfterReset = (await Product.find({}).select("slug name category subCategory").lean())
    .filter((product) => !isCoveredByCatalog(product))
    .map((product) => ({
      slug: product.slug || "",
      name: product.name?.ua || product.name?.en || "",
      category: product.category || "",
      subCategory: product.subCategory || "",
    }));

  return {
    totalProducts: products.length,
    migratedCount: migrated.length,
    unresolvedBeforeManualReview: unresolved,
    uncoveredAfterReset,
  };
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  const before = {
    categories: await Category.countDocuments(),
    subcategories: await SubCategory.countDocuments(),
  };

  await resetCatalogCollections();
  const migration = await migrateProducts();

  const after = {
    categories: await Category.countDocuments(),
    subcategories: await SubCategory.countDocuments(),
  };

  const catalog = await Category.find({})
    .select("category names description children order")
    .sort({ order: 1 })
    .lean();

  console.log(
    JSON.stringify(
      {
        stage: "catalog-reset",
        before,
        after,
        catalog: catalog.map((category) => ({
          category: category.category,
          names: category.names,
          description: category.description,
          children: (category.children || []).map((child) => ({
            key: child.key,
            names: child.names,
          })),
        })),
        migration,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Catalog reset failed", error);
  try {
    await mongoose.disconnect();
  } catch {
    // no-op
  }
  process.exit(1);
});
