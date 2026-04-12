const trimString = (value) => String(value || "").trim();

const normalizeIdentityTokens = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .map((item) => item.trim())
    .filter(Boolean);

export const slugifyProductText = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const buildProductSlug = ({ providedSlug = "", name = {}, fallbackSlug = "" } = {}) =>
  slugifyProductText(providedSlug) ||
  slugifyProductText(name?.en || name?.ua || fallbackSlug);

export const buildProductTypeKey = ({
  category = "",
  subCategory = "",
  fallbackTypeKey = "",
} = {}) => {
  const normalizedCategory = trimString(category);
  const normalizedSubCategory = trimString(subCategory);

  if (normalizedCategory && normalizedSubCategory) {
    return `${normalizedCategory}:${normalizedSubCategory}`;
  }

  return trimString(fallbackTypeKey);
};

export const buildProductSku = ({
  category = "",
  subCategory = "",
  slug = "",
  name = {},
  fallbackSku = "",
} = {}) => {
  const source = trimString(slug) || trimString(name?.en) || trimString(name?.ua) || trimString(fallbackSku);
  const tokens = [
    ...normalizeIdentityTokens(category),
    ...normalizeIdentityTokens(subCategory),
    ...normalizeIdentityTokens(source),
  ].map((item) => item.toUpperCase());

  const deduped = tokens.filter((item, index) => item && item !== tokens[index - 1]);
  return deduped.join("-").slice(0, 120);
};

export const ensureUniqueIdentityValue = (baseValue, usedValues) => {
  const normalizedBase = trimString(baseValue);
  if (!normalizedBase) return "";

  let candidate = normalizedBase;
  let counter = 2;

  while (usedValues.has(candidate)) {
    candidate = `${normalizedBase}-${counter}`;
    counter += 1;
  }

  usedValues.add(candidate);
  return candidate;
};
