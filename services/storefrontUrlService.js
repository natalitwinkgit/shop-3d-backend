const pickStr = (value) => String(value ?? "").trim();

const trimTrailingSlash = (value) => String(value || "").replace(/\/+$/, "");

const parseList = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export const getStorefrontBaseUrl = () => {
  const explicitBaseUrl = trimTrailingSlash(process.env.PUBLIC_STORE_URL);
  if (explicitBaseUrl) return explicitBaseUrl;

  return trimTrailingSlash(parseList(process.env.CLIENT_URL)[0]);
};

const encodePathPart = (value) => encodeURIComponent(pickStr(value));

export const getProductId = (product = {}) =>
  pickStr(product?._id || product?.id || product?.productId);

export const buildCatalogProductPath = (product = {}) => {
  const id = getProductId(product);
  const category = pickStr(product?.categorySlug || product?.categoryKey || product?.category);
  const subCategory = pickStr(
    product?.subCategorySlug || product?.subCategoryKey || product?.subCategory || product?.sub
  );

  if (!id || !category || !subCategory) return "";

  return `/catalog/${encodePathPart(category)}/${encodePathPart(subCategory)}/${encodePathPart(id)}`;
};

export const buildStorefrontProductUrl = (product = {}) => {
  const catalogPath = buildCatalogProductPath(product);
  if (!catalogPath) return "";

  const baseUrl = getStorefrontBaseUrl();
  return baseUrl ? `${baseUrl}${catalogPath}` : catalogPath;
};

export const buildProductApiUrl = (product = {}) => {
  const id = getProductId(product);
  if (id) return `/api/products/${encodeURIComponent(id)}`;

  const slug = pickStr(product?.slug);
  return slug ? `/api/products/by-slug/${encodeURIComponent(slug)}` : "";
};
