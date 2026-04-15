import Product from "../models/Product.js";
import { findColors } from "./colorService.js";
import { attachColorReferencesToProducts } from "./productColorReferenceService.js";
import { attachProductInventoryAvailability } from "./productInventoryAvailabilityService.js";

const pickStr = (value) => String(value ?? "").trim();

const normalizeText = (value) =>
  pickStr(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9а-яіїєґ_ -]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const PRODUCT_CATEGORY_FAMILIES = [
  {
    key: "sofas",
    aliases: [
      "sofa",
      "sofas",
      "couch",
      "couches",
      "диван",
      "дивани",
      "диванів",
      "demo-sofa",
      "demo-sofas",
    ],
    categories: ["sofas", "demo-sofas"],
  },
  {
    key: "beds",
    aliases: ["bed", "beds", "ліжко", "ліжка", "demo-bed", "demo-beds"],
    categories: ["beds", "demo-beds"],
  },
  {
    key: "chairs",
    aliases: [
      "chair",
      "chairs",
      "armchair",
      "armchairs",
      "стілець",
      "стільці",
      "крісло",
      "крісла",
      "demo-chair",
      "demo-chairs",
    ],
    categories: ["chairs", "armchairs", "demo-chairs"],
  },
  {
    key: "tables",
    aliases: [
      "table",
      "tables",
      "desk",
      "desks",
      "стіл",
      "столи",
      "столик",
      "столики",
      "demo-table",
      "demo-tables",
    ],
    categories: ["tables", "demo-tables"],
  },
  {
    key: "wardrobes",
    aliases: ["wardrobe", "wardrobes", "шафа", "шафи"],
    categories: ["wardrobes"],
  },
  {
    key: "commodes",
    aliases: ["commode", "commodes", "тумба", "тумби", "tv stand", "tv-stand", "media stand"],
    categories: ["commodes"],
  },
];

const GENERIC_PRODUCT_TERMS = [
  "product",
  "products",
  "furniture",
  "товар",
  "товари",
  "меблі",
  "мебель",
];

const SEARCH_STOP_WORDS = new Set([
  "для",
  "типу",
  "та",
  "або",
  "і",
  "й",
  "на",
  "по",
  "of",
  "the",
  "and",
  "or",
]);

const QUERY_INTENT_HINTS = [
  {
    key: "outdoor",
    aliases: [
      "outdoor",
      "garden",
      "garden furniture",
      "outdoor furniture",
      "patio",
      "terrace",
      "balcony",
      "open air",
      "outside",
      "picnic",
      "пікнік",
      "пікніка",
      "пікніку",
      "пікніков",
      "садов",
      "садова",
      "садові",
      "садовий",
      "садове",
      "садова меблі",
      "садові меблі",
      "вуличн",
      "вулична",
      "вуличні",
      "вуличний",
    ],
    positiveTerms: [
      "outdoor",
      "garden",
      "picnic",
      "patio",
      "terrace",
      "balcony",
      "садов",
      "пікнік",
      "вуличн",
    ],
    negativeTerms: ["office", "desk", "home office", "письмов", "робоч", "computer"],
  },
];

const COLOR_QUERY_HINTS = [
  {
    pattern: /(pink|розов|рожев|rose|fuchsia|hot ?pink|light ?pink|deep ?pink|misty ?rose)/i,
    keys: ["pink", "lightpink", "hotpink", "deeppink", "mistyrose", "dusty-rose"],
  },
  {
    pattern: /(red|червон|crimson|salmon|coral|tomato)/i,
    keys: ["red", "indianred", "lightcoral", "salmon", "darksalmon", "lightsalmon", "crimson"],
  },
  {
    pattern: /(orange|оранж|amber|coral)/i,
    keys: ["orange", "darkorange", "coral", "lightsalmon"],
  },
  {
    pattern: /(yellow|gold|жовт|mustard)/i,
    keys: ["yellow", "gold", "khaki", "lightyellow"],
  },
  {
    pattern: /(green|зелено|olive|emerald|mint|sage)/i,
    keys: ["green", "forestgreen", "seagreen", "olive", "limegreen", "mintcream"],
  },
  {
    pattern: /(blue|син|navy|azure|sky)/i,
    keys: ["blue", "lightblue", "deepskyblue", "royalblue", "navy", "skyblue", "azure"],
  },
  {
    pattern: /(purple|violet|фіолет|пурпур|orchid|lilac)/i,
    keys: ["purple", "violet", "orchid", "plum", "mediumorchid", "thistle"],
  },
  {
    pattern: /(gray|grey|сір|silver|graphite|ash|stone)/i,
    keys: ["gray", "grey", "lightgray", "darkgray", "dimgray", "silver", "graphite", "ash", "stone"],
  },
  {
    pattern: /(black|white|чорн|білий|білі|ivory|cream|sand|beige|taupe|brown|walnut|oak)/i,
    keys: ["black", "white", "ivory", "cream", "sand", "beige", "taupe", "brown", "walnut", "oak"],
  },
];

const BUILD_FIELDS =
  "_id slug name description category subCategory typeKey price discount inStock stockQty status images previewImage colorKeys roomKeys collectionKeys featureKeys updatedAt";

const formatMoneyUa = (value) =>
  new Intl.NumberFormat("uk-UA", {
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const getProductName = (product = {}) =>
  pickStr(product?.name?.ua) ||
  pickStr(product?.name?.en) ||
  pickStr(product?.slug) ||
  "Товар";

const getProductStorefrontUrl = (slug) => {
  const safeSlug = pickStr(slug);
  if (!safeSlug) return "";

  const baseUrl = pickStr(process.env.PUBLIC_STORE_URL).replace(/\/+$/, "");
  if (!baseUrl) return `/products/${encodeURIComponent(safeSlug)}`;

  return `${baseUrl}/products/${encodeURIComponent(safeSlug)}`;
};

const getProductApiUrl = (slug) =>
  `/api/products/by-slug/${encodeURIComponent(pickStr(slug))}`;

const toFinalPrice = (product = {}) => {
  const price = Number(product?.price || 0);
  const discount = Number(product?.discount || 0);
  return Math.max(0, price * (1 - discount / 100));
};

const getColorKeys = (product = {}) =>
  Array.from(
    new Set(
      (Array.isArray(product?.colorKeys) ? product.colorKeys : [])
        .map((key) => pickStr(key).toLowerCase())
        .filter(Boolean)
    )
  );

const collectTextTokens = (query = "") =>
  normalizeText(query)
    .split(" ")
    .map((token) => token.trim())
    .filter(
      (token) =>
        token &&
        token.length > 2 &&
        !GENERIC_PRODUCT_TERMS.includes(token) &&
        !SEARCH_STOP_WORDS.has(token)
    );

const buildTokenVariants = (token = "") => {
  const normalized = normalizeText(token);
  if (!normalized) return [];

  const variants = new Set([normalized]);
  if (normalized.length <= 4) {
    return Array.from(variants);
  }

  const suffixes = [
    "ами",
    "ями",
    "ого",
    "ому",
    "ими",
    "ої",
    "ий",
    "ій",
    "а",
    "я",
    "у",
    "ю",
    "і",
    "и",
    "ом",
    "ем",
    "ов",
    "ев",
    "ів",
    "їв",
    "ь",
  ];

  for (const suffix of suffixes) {
    if (normalized.endsWith(suffix) && normalized.length > suffix.length + 1) {
      variants.add(normalized.slice(0, -suffix.length));
    }
  }

  return Array.from(variants).filter((value) => value.length > 2);
};

const buildSearchTokens = (query = "") =>
  Array.from(
    new Set(
      collectTextTokens(query).flatMap((token) => buildTokenVariants(token))
    )
  ).filter((token) => token.length > 2);

const detectQueryIntentKeys = (query = "") => {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  const intentKeys = new Set();

  for (const intent of QUERY_INTENT_HINTS) {
    if (intent.aliases.some((alias) => normalizedQuery.includes(normalizeText(alias)))) {
      intentKeys.add(intent.key);
    }
  }

  return Array.from(intentKeys);
};

const buildProductSearchText = (product = {}) =>
  normalizeText(
    [
      getProductName(product),
      pickStr(product?.slug),
      pickStr(product?.category),
      pickStr(product?.subCategory),
      pickStr(product?.typeKey),
      pickStr(product?.description?.ua),
      pickStr(product?.description?.en),
      ...(Array.isArray(product?.roomKeys) ? product.roomKeys.map((key) => pickStr(key)) : []),
      ...(Array.isArray(product?.collectionKeys)
        ? product.collectionKeys.map((key) => pickStr(key))
        : []),
      ...(Array.isArray(product?.featureKeys) ? product.featureKeys.map((key) => pickStr(key)) : []),
      ...(Array.isArray(product?.colors)
        ? product.colors.flatMap((color) => [
            pickStr(color?.name?.ua),
            pickStr(color?.name?.en),
            pickStr(color?.key),
          ])
        : []),
    ]
      .filter(Boolean)
      .join(" ")
  );

const detectProductCategories = (query = "", explicitCategory = "") => {
  const normalizedQuery = normalizeText(query);
  const normalizedExplicit = normalizeText(explicitCategory);
  const matches = new Set();

  const allValues = [normalizedExplicit, normalizedQuery].filter(Boolean);

  for (const value of allValues) {
    for (const family of PRODUCT_CATEGORY_FAMILIES) {
      if (family.aliases.some((alias) => value.includes(normalizeText(alias)))) {
        family.categories.forEach((category) => matches.add(category));
      }
    }
  }

  if (!matches.size && normalizedExplicit) {
    matches.add(normalizedExplicit);
  }

  return Array.from(matches);
};

const detectColorHintsFromQuery = (query = "") => {
  const normalized = normalizeText(query);
  if (!normalized) return [];

  return Array.from(
    new Set(
      COLOR_QUERY_HINTS.flatMap(({ pattern, keys }) =>
        pattern.test(normalized) ? keys : []
      ).map((key) => key.toLowerCase())
    )
  );
};

const detectColorKeys = async ({ query = "", explicitColor = "" } = {}) => {
  const colorQueries = [explicitColor, query].map((value) => pickStr(value)).filter(Boolean);
  const detected = new Set();

  for (const colorQuery of colorQueries) {
    const colors = await findColors(colorQuery);
    colors.forEach((color) => {
      const key = pickStr(color?.key).toLowerCase();
      if (key) detected.add(key);
    });
  }

  detectColorHintsFromQuery(query).forEach((key) => detected.add(key));
  detectColorHintsFromQuery(explicitColor).forEach((key) => detected.add(key));

  return Array.from(detected);
};

const parseBudgetFromQuery = (query = "") => {
  const text = pickStr(query).toLowerCase();
  if (!text) return {};

  const result = {};
  const rangeMatch = text.match(/від\s*([\d\s]+)\s*(?:грн|гривень|uah)?\s*до\s*([\d\s]+)\s*(?:грн|гривень|uah)?/i);
  if (rangeMatch) {
    const minValue = Number(String(rangeMatch[1] || "").replace(/[^\d]/g, ""));
    const maxValue = Number(String(rangeMatch[2] || "").replace(/[^\d]/g, ""));
    if (Number.isFinite(minValue)) result.minPrice = minValue;
    if (Number.isFinite(maxValue)) result.maxPrice = maxValue;
    return result;
  }

  const maxMatch = text.match(/до\s*([\d\s]+)\s*(?:грн|гривень|uah)?/i);
  if (maxMatch) {
    const maxValue = Number(String(maxMatch[1] || "").replace(/[^\d]/g, ""));
    if (Number.isFinite(maxValue)) result.maxPrice = maxValue;
  }

  const minMatch = text.match(/від\s*([\d\s]+)\s*(?:грн|гривень|uah)?/i);
  if (minMatch) {
    const minValue = Number(String(minMatch[1] || "").replace(/[^\d]/g, ""));
    if (Number.isFinite(minValue)) result.minPrice = minValue;
  }

  return result;
};

const buildEffectivePriceExpr = () => ({
  $multiply: [
    { $ifNull: ["$price", 0] },
    {
      $subtract: [1, { $divide: [{ $ifNull: ["$discount", 0] }, 100] }],
    },
  ],
});

const composeAndFilter = (...clauses) => {
  const cleanClauses = clauses.filter(Boolean);
  if (!cleanClauses.length) return {};
  if (cleanClauses.length === 1) return cleanClauses[0];
  return { $and: cleanClauses };
};

const buildTextClause = (query = "") => {
  const searchTokens = buildSearchTokens(query);
  if (!searchTokens.length) return null;

  const textFields = [
    "name.ua",
    "name.en",
    "slug",
    "category",
    "subCategory",
    "typeKey",
    "description.ua",
    "description.en",
  ];

  return {
    $or: searchTokens.flatMap((token) => {
      const regex = new RegExp(escapeRegex(token), "i");
      return textFields.map((field) => ({ [field]: regex }));
    }),
  };
};

const scoreProduct = (
  product = {},
  { categoryKeys = [], colorKeys = [], query = "", minPrice, maxPrice } = {}
) => {
  const normalizedQuery = normalizeText(query);
  const tokens = collectTextTokens(normalizedQuery);
  const productTokens = buildProductSearchText(product);
  const queryIntentKeys = detectQueryIntentKeys(query);

  const productColorKeys = getColorKeys(product);
  const matchedColorKeys = colorKeys.filter((key) => productColorKeys.includes(key));
  const finalPrice = toFinalPrice(product);

  let score = 0;

  if (categoryKeys.length && categoryKeys.includes(pickStr(product?.category).toLowerCase())) {
    score += 60;
  }

  if (matchedColorKeys.length) {
    score += 40 + matchedColorKeys.length * 10;
  } else if (colorKeys.length) {
    score -= 10;
  }

  if (tokens.length) {
    const matchedTokens = tokens.filter((token) =>
      buildTokenVariants(token).some((variant) => productTokens.includes(variant))
    );
    score += matchedTokens.length * 10;
  }

  if (queryIntentKeys.includes("outdoor")) {
    if (
      QUERY_INTENT_HINTS[0].positiveTerms.some((term) =>
        productTokens.includes(normalizeText(term))
      )
    ) {
      score += 30;
    }

    if (
      QUERY_INTENT_HINTS[0].negativeTerms.some((term) =>
        productTokens.includes(normalizeText(term))
      )
    ) {
      score -= 18;
    }
  }

  if (Number.isFinite(minPrice) || Number.isFinite(maxPrice)) {
    if (Number.isFinite(minPrice) && finalPrice < minPrice) {
      score -= Math.min(20, (minPrice - finalPrice) / 1000);
    } else if (Number.isFinite(maxPrice) && finalPrice > maxPrice) {
      score -= Math.min(20, (finalPrice - maxPrice) / 1000);
    } else {
      score += 10;
    }
  }

  if (product?.inStock) score += 5;

  return {
    score,
    matchedColorKeys,
  };
};

export const rankCatalogProducts = (products = [], options = {}) =>
  (Array.isArray(products) ? products : [])
    .filter(Boolean)
    .map((product) => {
      const { score, matchedColorKeys } = scoreProduct(product, options);
      return {
        ...product,
        matchScore: score,
        matchedColorKeys,
      };
    })
    .sort((left, right) => {
      if (right.matchScore !== left.matchScore) return right.matchScore - left.matchScore;
      return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime();
    });

const toProductSummary = (product = {}) => ({
  id: String(product._id || product.id || ""),
  slug: pickStr(product.slug),
  title: getProductName(product),
  category: pickStr(product.category),
  subCategory: pickStr(product.subCategory),
  typeKey: pickStr(product.typeKey),
  roomKeys: Array.isArray(product.roomKeys) ? product.roomKeys : [],
  collectionKeys: Array.isArray(product.collectionKeys) ? product.collectionKeys : [],
  featureKeys: Array.isArray(product.featureKeys) ? product.featureKeys : [],
  price: Number(product.price || 0),
  discount: Number(product.discount || 0),
  finalPrice: toFinalPrice(product),
  currency: "UAH",
  image: pickStr(product.primaryImage || product.previewImage || product.images?.[0] || ""),
  storefrontUrl: getProductStorefrontUrl(product.slug),
  apiUrl: getProductApiUrl(product.slug),
  inStock: !!product.inStock,
  stockQty: Number(product.stockQty || 0),
  colorKeys: getColorKeys(product),
  colors: Array.isArray(product.colors) ? product.colors : [],
  primaryColor: product.primaryColor || product.colors?.[0] || null,
  matchedColorKeys: Array.isArray(product.matchedColorKeys) ? product.matchedColorKeys : [],
  matchScore: Number(product.matchScore || 0),
});

const buildCandidateFilters = ({
  query,
  categoryKeys = [],
  colorKeys = [],
  intentKeys = [],
  minPrice,
  maxPrice,
}) => {
  const textClause = buildTextClause(query);
  const priceClause =
    Number.isFinite(minPrice) || Number.isFinite(maxPrice)
      ? {
          $expr: (() => {
            const expr = buildEffectivePriceExpr();
            if (Number.isFinite(minPrice) && Number.isFinite(maxPrice)) {
              return {
                $and: [
                  { $gte: [expr, minPrice] },
                  { $lte: [expr, maxPrice] },
                ],
              };
            }
            if (Number.isFinite(minPrice)) return { $gte: [expr, minPrice] };
            return { $lte: [expr, maxPrice] };
          })(),
        }
      : null;

  const categoryClause = categoryKeys.length ? { category: { $in: categoryKeys } } : null;
  const colorClause = colorKeys.length ? { colorKeys: { $in: colorKeys } } : null;
  const intentClause = intentKeys.length
    ? {
        $or: [
          { roomKeys: { $in: intentKeys } },
          { collectionKeys: { $in: intentKeys } },
          { featureKeys: { $in: intentKeys } },
        ],
      }
    : null;

  const variants = [];

  if (categoryClause && colorClause && intentClause && textClause) {
    variants.push(
      composeAndFilter({ status: "active" }, categoryClause, colorClause, intentClause, priceClause, textClause)
    );
  }

  if (categoryClause && intentClause && textClause) {
    variants.push(composeAndFilter({ status: "active" }, categoryClause, intentClause, priceClause, textClause));
  }

  if (categoryClause && colorClause && textClause) {
    variants.push(composeAndFilter({ status: "active" }, categoryClause, colorClause, priceClause, textClause));
  }

  if (categoryClause && textClause) {
    variants.push(composeAndFilter({ status: "active" }, categoryClause, priceClause, textClause));
  }

  if (categoryClause && colorClause && intentClause) {
    variants.push(composeAndFilter({ status: "active" }, categoryClause, colorClause, intentClause, priceClause));
  }

  if (categoryClause && intentClause) {
    variants.push(composeAndFilter({ status: "active" }, categoryClause, intentClause, priceClause));
  }

  if (categoryClause && colorClause) {
    variants.push(composeAndFilter({ status: "active" }, categoryClause, colorClause, priceClause));
  }

  if (categoryClause) {
    variants.push(composeAndFilter({ status: "active" }, categoryClause, priceClause));
  }

  if (intentClause && textClause) {
    variants.push(composeAndFilter({ status: "active" }, intentClause, priceClause, textClause));
  }

  if (intentClause) {
    variants.push(composeAndFilter({ status: "active" }, intentClause, priceClause));
  }

  if (colorClause && textClause) {
    variants.push(composeAndFilter({ status: "active" }, colorClause, priceClause, textClause));
  }

  if (colorClause) {
    variants.push(composeAndFilter({ status: "active" }, colorClause, priceClause));
  }

  if (textClause) {
    variants.push(composeAndFilter({ status: "active" }, priceClause, textClause));
  }

  variants.push(composeAndFilter({ status: "active" }, priceClause));
  variants.push({ status: "active" });

  return variants;
};

const fetchCandidateProducts = async ({
  query,
  categoryKeys,
  colorKeys,
  intentKeys,
  minPrice,
  maxPrice,
  limit,
}) => {
  const safeLimit = Math.max(1, Math.min(10, Number(limit) || 5));
  const candidateFetchLimit = Math.max(safeLimit * 8, 20);
  const uniqueProducts = new Map();
  const variants = buildCandidateFilters({
    query,
    categoryKeys,
    colorKeys,
    intentKeys,
    minPrice,
    maxPrice,
  });

  for (const filter of variants) {
    const rows = await Product.find(filter)
      .select(BUILD_FIELDS)
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(candidateFetchLimit)
      .lean();

    rows.forEach((row) => {
      const id = String(row._id || row.id || "");
      if (!id || uniqueProducts.has(id)) return;
      uniqueProducts.set(id, row);
    });

    if (uniqueProducts.size >= candidateFetchLimit) break;
  }

  return Array.from(uniqueProducts.values());
};

export const isCatalogProductQuery = (query = "") => {
  const normalized = normalizeText(query);
  if (!normalized) return false;

  const budget = parseBudgetFromQuery(normalized);
  if (Number.isFinite(budget.minPrice) || Number.isFinite(budget.maxPrice)) return true;
  if (GENERIC_PRODUCT_TERMS.some((term) => normalized.includes(normalizeText(term)))) return true;
  if (detectProductCategories(normalized).length) return true;
  if (detectColorHintsFromQuery(normalized).length) return true;
  if (detectQueryIntentKeys(normalized).length) return true;

  return false;
};

export const searchCatalogProducts = async ({
  query = "",
  category = "",
  color = "",
  minPrice,
  maxPrice,
  limit = 5,
  includeInventory = true,
} = {}) => {
  const normalizedQuery = pickStr(query);
  const detectedCategories = detectProductCategories(normalizedQuery, category);
  const explicitColorKeys = await detectColorKeys({ query: color, explicitColor: color });
  const queryColorKeys = await detectColorKeys({ query: normalizedQuery });
  const detectedColorKeys = Array.from(
    new Set([...explicitColorKeys, ...queryColorKeys].map((key) => pickStr(key).toLowerCase()).filter(Boolean))
  );
  const detectedIntentKeys = detectQueryIntentKeys(normalizedQuery);

  const parsedBudget = parseBudgetFromQuery(normalizedQuery);
  const resolvedMinPrice =
    Number.isFinite(Number(minPrice)) && Number(minPrice) >= 0
      ? Number(minPrice)
      : parsedBudget.minPrice;
  const resolvedMaxPrice =
    Number.isFinite(Number(maxPrice)) && Number(maxPrice) >= 0
      ? Number(maxPrice)
      : parsedBudget.maxPrice;

  const isProductQuery = isCatalogProductQuery(normalizedQuery);
  const candidateProducts = await fetchCandidateProducts({
    query: normalizedQuery,
    categoryKeys: detectedCategories,
    colorKeys: detectedColorKeys,
    intentKeys: detectedIntentKeys,
    minPrice: resolvedMinPrice,
    maxPrice: resolvedMaxPrice,
    limit,
  });

  const scoredProducts = rankCatalogProducts(candidateProducts, {
    categoryKeys: detectedCategories,
    colorKeys: detectedColorKeys,
    query: normalizedQuery,
    minPrice: resolvedMinPrice,
    maxPrice: resolvedMaxPrice,
  });

  const topProducts = scoredProducts.slice(0, Math.max(1, Math.min(10, Number(limit) || 5)));
  const withColors = await attachColorReferencesToProducts(topProducts);
  const withInventory = includeInventory
    ? await attachProductInventoryAvailability(withColors)
    : withColors;

  const items = (Array.isArray(withInventory) ? withInventory : [withInventory].filter(Boolean)).map(
    toProductSummary
  );

  return {
    query: normalizedQuery,
    category: detectedCategories[0] || "",
    categories: detectedCategories,
    color: pickStr(color),
    colorKeys: detectedColorKeys,
    minPrice: Number.isFinite(resolvedMinPrice) ? resolvedMinPrice : null,
    maxPrice: Number.isFinite(resolvedMaxPrice) ? resolvedMaxPrice : null,
    count: items.length,
    isProductQuery,
    items,
  };
};

const getColorLabel = (color = {}) =>
  pickStr(color?.name?.ua) || pickStr(color?.name?.en) || pickStr(color?.key);

const getHighlightColor = (item = {}) => {
  const matchedColorKeys = Array.isArray(item?.matchedColorKeys) ? item.matchedColorKeys : [];
  if (matchedColorKeys.length && Array.isArray(item?.colors)) {
    const matched = item.colors.find((color) => matchedColorKeys.includes(pickStr(color?.key).toLowerCase()));
    if (matched) return matched;
  }

  return item?.primaryColor || item?.colors?.[0] || null;
};

export const buildCatalogReply = (searchResult = {}) => {
  const items = Array.isArray(searchResult?.items) ? searchResult.items.filter(Boolean) : [];
  const topItem = items[0] || null;
  const colorIntent = Array.isArray(searchResult?.colorKeys) && searchResult.colorKeys.length > 0;
  const hasColorMatch = !!topItem && Array.isArray(topItem.matchedColorKeys) && topItem.matchedColorKeys.length > 0;

  if (!topItem) {
    return colorIntent
      ? "Не знайшов точного збігу в каталозі. Уточніть колір, категорію або бюджет, і я підберу ближчі варіанти."
      : "Не знайшов точного варіанту в каталозі. Уточніть категорію, колір або бюджет, і я підберу схожі товари.";
  }

  const intro =
    colorIntent && !hasColorMatch
      ? "Не знайшов точного збігу за кольором, але ось найкращий варіант з каталогу:"
      : "Знайшов у каталозі найкращий варіант:";

  const price = formatMoneyUa(topItem.finalPrice || topItem.price || 0);
  const highlightColor = getHighlightColor(topItem);
  const colorLabel = highlightColor ? getColorLabel(highlightColor) : "";
  const statusLine = topItem.inStock ? "" : "Наразі немає в наявності.";
  const title = pickStr(topItem.title) || getProductName(topItem);

  return [
    intro,
    `1. ${title}${colorLabel ? `, колір: ${colorLabel}` : ""} — ${price} грн`,
    statusLine,
    "Покажу одну картку товару з найкращим збігом, щоб її можна було відкрити одразу.",
  ].join("\n");
};
