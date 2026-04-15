const pickStr = (value) => String(value ?? "").trim();

const trimTrailingSlash = (value) => String(value || "").replace(/\/+$/, "");

const getStorefrontBaseUrl = () => {
  const explicitBaseUrl = trimTrailingSlash(process.env.PUBLIC_STORE_URL);
  if (explicitBaseUrl) return explicitBaseUrl;

  const clientUrl = String(process.env.CLIENT_URL || "")
    .split(",")
    .map((item) => item.trim())
    .find(Boolean);

  return trimTrailingSlash(clientUrl);
};

const buildStorefrontProductUrl = (slug) => {
  const safeSlug = pickStr(slug);
  if (!safeSlug) return "";

  const baseUrl = getStorefrontBaseUrl();
  if (!baseUrl) return `/products/${encodeURIComponent(safeSlug)}`;

  return `${baseUrl}/products/${encodeURIComponent(safeSlug)}`;
};

const getProductDisplayName = (productDoc) =>
  pickStr(productDoc?.title) ||
  pickStr(productDoc?.name?.ua) ||
  pickStr(productDoc?.name?.en) ||
  pickStr(productDoc?.slug) ||
  "Товар";

export const buildProductCards = (items = [], { limit = 1 } = {}) =>
  (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .slice(0, Math.max(1, Number(limit) || 1))
    .map((item) => ({
      id: String(item.id || ""),
      slug: pickStr(item.slug),
      title: getProductDisplayName(item),
      category: pickStr(item.category),
      subCategory: pickStr(item.subCategory),
      price: Number(item.price || 0),
      finalPrice: Number(item.finalPrice || item.price || 0),
      currency: "UAH",
      image: pickStr(item.image || item.primaryImage || item.images?.[0] || ""),
      storefrontUrl: pickStr(item.storefrontUrl) || buildStorefrontProductUrl(item.slug),
      apiUrl: pickStr(item.apiUrl) || `/api/products/by-slug/${encodeURIComponent(pickStr(item.slug))}`,
      inStock: !!item.inStock,
      stockQty: Number(item.stockQty || 0),
      colorKeys: Array.isArray(item.colorKeys) ? item.colorKeys : [],
      colors: Array.isArray(item.colors) ? item.colors : [],
      primaryColor: item.primaryColor || item.colors?.[0] || null,
    }));
