import { normalizeRoomKeys } from "./catalogNormalizationService.js";
import {
  buildProductSku,
  buildProductSlug,
  buildProductTypeKey,
} from "./productIdentityService.js";

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const trimString = (value) => String(value || "").trim();

const tryParseJson = (value) => {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!["{", "["].includes(trimmed[0])) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

export const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const parseStringField = (
  value,
  fieldName,
  { allowEmpty = true, strict = false } = {}
) => {
  if (value === undefined) return undefined;
  if (value === null) {
    if (!allowEmpty) throw createHttpError(400, `${fieldName} is required`);
    if (strict) throw createHttpError(400, `${fieldName} must be a string`);
    return "";
  }

  if (strict && typeof value !== "string") {
    throw createHttpError(400, `${fieldName} must be a string`);
  }

  if (typeof value === "object") {
    throw createHttpError(400, `${fieldName} must be a string`);
  }

  const normalized = trimString(value);
  if (!allowEmpty && !normalized) {
    throw createHttpError(400, `${fieldName} is required`);
  }

  return normalized;
};

const parseNumberField = (
  value,
  fieldName,
  { required = false, min = null } = {}
) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    if (required) throw createHttpError(400, `${fieldName} is required`);
    return undefined;
  }

  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    throw createHttpError(400, `${fieldName} must be a number`);
  }

  if (min !== null && normalized < min) {
    throw createHttpError(400, `${fieldName} must be at least ${min}`);
  }

  return normalized;
};

const parseStringArrayField = (value, fieldName) => {
  if (value === undefined) return undefined;

  const parsed = tryParseJson(value);
  let source = [];

  if (Array.isArray(parsed)) {
    source = parsed;
  } else if (typeof parsed === "string") {
    const trimmed = parsed.trim();
    source = trimmed ? trimmed.split(/[\r\n,;]+/) : [];
  } else {
    throw createHttpError(400, `${fieldName} must be an array of strings`);
  }

  const items = source.map((item) => {
    if (typeof item !== "string") {
      throw createHttpError(400, `${fieldName} must be an array of strings`);
    }

    return item.trim();
  });

  return Array.from(new Set(items.filter(Boolean)));
};

const parseObjectField = (value, fieldName) => {
  if (value === undefined) return undefined;

  const parsed = tryParseJson(value);
  if (!isPlainObject(parsed)) {
    throw createHttpError(400, `${fieldName} must be an object`);
  }

  return parsed;
};

const resolveLocalizedText = ({
  body,
  fieldName,
  existingValue,
  required = false,
  partial = false,
}) => {
  const rawValue = hasOwn(body, fieldName) ? tryParseJson(body[fieldName]) : undefined;
  const rawUa = hasOwn(body, `${fieldName}_ua`) ? body[`${fieldName}_ua`] : undefined;
  const rawEn = hasOwn(body, `${fieldName}_en`) ? body[`${fieldName}_en`] : undefined;
  const hasInput = rawValue !== undefined || rawUa !== undefined || rawEn !== undefined;

  if (!hasInput) {
    if (partial) return undefined;

    if (required && !existingValue) {
      throw createHttpError(400, `${fieldName} is required`);
    }

    return {
      ua: trimString(existingValue?.ua),
      en: trimString(existingValue?.en),
    };
  }

  let ua = "";
  let en = "";

  if (typeof rawValue === "string") {
    ua = rawValue.trim();
    en = rawValue.trim();
  } else if (isPlainObject(rawValue)) {
    ua = trimString(rawValue.ua ?? rawValue.uk ?? rawValue.value);
    en = trimString(rawValue.en ?? rawValue.value ?? rawValue.ua ?? rawValue.uk);
  } else if (rawValue !== undefined) {
    throw createHttpError(400, `${fieldName} must be a string or localized object`);
  }

  if (rawUa !== undefined) ua = parseStringField(rawUa, `${fieldName}_ua`) || "";
  if (rawEn !== undefined) en = parseStringField(rawEn, `${fieldName}_en`) || "";

  ua = ua || trimString(existingValue?.ua);
  en = en || trimString(existingValue?.en) || ua;
  ua = ua || en;

  if (required && (!ua || !en)) {
    throw createHttpError(400, `${fieldName} is required`);
  }

  return { ua, en };
};

const mergePreviewIntoImages = (previewImage, images = []) => {
  const cleanImages = Array.from(new Set((images || []).map((item) => trimString(item)).filter(Boolean)));
  if (!previewImage) return cleanImages;
  return [previewImage, ...cleanImages.filter((item) => item !== previewImage)];
};

export const buildProductMutationPayload = ({
  body = {},
  existingProduct = null,
  partial = false,
  allowInventoryFields = false,
}) => {
  const payload = {};
  const isCreate = !partial && !existingProduct;

  const name = resolveLocalizedText({
    body,
    fieldName: "name",
    existingValue: existingProduct?.name,
    required: isCreate,
    partial,
  });
  if (name !== undefined) payload.name = name;

  const description = resolveLocalizedText({
    body,
    fieldName: "description",
    existingValue: existingProduct?.description,
    partial,
  });
  if (description !== undefined) payload.description = description;

  const price = parseNumberField(body.price, "price", { required: isCreate, min: 0 });
  if (price !== undefined) payload.price = price;

  if (hasOwn(body, "discount") || isCreate) {
    const discount = parseNumberField(body.discount, "discount", { min: 0 });
    payload.discount = discount ?? 0;
  }

  if (hasOwn(body, "category") || isCreate) {
    payload.category = parseStringField(body.category, "category", { allowEmpty: false });
  }

  if (hasOwn(body, "subCategory")) {
    payload.subCategory = parseStringField(body.subCategory, "subCategory") || null;
  } else if (isCreate && existingProduct?.subCategory == null) {
    payload.subCategory = null;
  }

  const shouldResolveSlug =
    hasOwn(body, "slug") || isCreate || (!trimString(existingProduct?.slug) && !!existingProduct);
  if (shouldResolveSlug) {
    const providedSlug = parseStringField(body.slug, "slug") || "";
    const nextSlug = buildProductSlug({
      providedSlug,
      name: payload.name || existingProduct?.name,
      fallbackSlug: existingProduct?.slug,
    });

    if (!nextSlug) {
      throw createHttpError(400, "slug is required");
    }

    payload.slug = nextSlug;
  }

  const effectiveCategory = payload.category ?? trimString(existingProduct?.category);
  const effectiveSubCategory =
    payload.subCategory !== undefined ? payload.subCategory : existingProduct?.subCategory;

  const shouldResolveTypeKey =
    hasOwn(body, "typeKey") ||
    isCreate ||
    hasOwn(body, "category") ||
    hasOwn(body, "subCategory") ||
    !trimString(existingProduct?.typeKey);

  if (hasOwn(body, "typeKey")) {
    payload.typeKey = parseStringField(body.typeKey, "typeKey") || "";
  } else if (shouldResolveTypeKey) {
    payload.typeKey = buildProductTypeKey({
      category: effectiveCategory,
      subCategory: effectiveSubCategory,
      fallbackTypeKey: existingProduct?.typeKey,
    });
  }

  const shouldResolveSku =
    hasOwn(body, "sku") || isCreate || !trimString(existingProduct?.sku);

  if (hasOwn(body, "sku")) {
    payload.sku = parseStringField(body.sku, "sku", { strict: true }) || trimString(existingProduct?.sku);
  } else if (shouldResolveSku) {
    payload.sku = buildProductSku({
      category: effectiveCategory,
      subCategory: effectiveSubCategory,
      slug: payload.slug ?? existingProduct?.slug,
      name: payload.name || existingProduct?.name,
      fallbackSku: existingProduct?.sku,
    });
  }

  if (hasOwn(body, "status") || isCreate) {
    payload.status = parseStringField(body.status, "status") || "active";
  }

  const styleKeys = parseStringArrayField(body.styleKeys, "styleKeys");
  if (styleKeys !== undefined) payload.styleKeys = styleKeys;
  else if (isCreate) payload.styleKeys = [];

  const colorKeys = parseStringArrayField(body.colorKeys ?? body.colors, "colorKeys");
  if (colorKeys !== undefined) payload.colorKeys = colorKeys;
  else if (isCreate) payload.colorKeys = [];

  const roomKeys = parseStringArrayField(body.roomKeys, "roomKeys");
  if (roomKeys !== undefined) payload.roomKeys = normalizeRoomKeys(roomKeys);
  else if (isCreate) payload.roomKeys = [];

  const collectionKeys = parseStringArrayField(body.collectionKeys, "collectionKeys");
  if (collectionKeys !== undefined) payload.collectionKeys = collectionKeys;
  else if (isCreate) payload.collectionKeys = [];

  const featureKeys = parseStringArrayField(body.featureKeys, "featureKeys");
  if (featureKeys !== undefined) payload.featureKeys = featureKeys;
  else if (isCreate) payload.featureKeys = [];

  const specifications = parseObjectField(body.specifications, "specifications");
  if (specifications !== undefined) payload.specifications = specifications;
  else if (isCreate) payload.specifications = {};

  if (allowInventoryFields) {
    if (hasOwn(body, "inStock") || isCreate) {
      payload.inStock = hasOwn(body, "inStock")
        ? String(body.inStock).toLowerCase() === "true" || String(body.inStock) === "1"
        : true;
    }

    if (hasOwn(body, "stockQty") || isCreate) {
      const stockQty = parseNumberField(body.stockQty, "stockQty", { min: 0 });
      payload.stockQty = stockQty ?? 0;
    }
  }

  const previewImageField = ["previewImage", "imageUrl", "coverImageUrl", "mainImageUrl"].find(
    (field) => hasOwn(body, field)
  );
  const imagesField = ["images", "keepImages", "imageUrls", "galleryUrls", "photoUrls", "photos"].find(
    (field) => hasOwn(body, field)
  );
  const modelUrlField = ["modelUrl", "model3dUrl", "model3DUrl", "glbUrl"].find((field) =>
    hasOwn(body, field)
  );

  const previewImageProvided = Boolean(previewImageField);
  const imagesProvided = Boolean(imagesField);
  const modelUrlProvided = Boolean(modelUrlField);

  const previewImage = previewImageProvided
    ? parseStringField(body[previewImageField], previewImageField, { strict: true }) || ""
    : undefined;
  const imageList = imagesProvided
    ? parseStringArrayField(body[imagesField], imagesField) || []
    : undefined;
  const currentImages = Array.isArray(existingProduct?.images) ? existingProduct.images : [];
  const currentPreview =
    trimString(existingProduct?.previewImage) || trimString(currentImages[0]) || "";

  if (previewImageProvided || imagesProvided || isCreate) {
    const baseImages = imageList ?? currentImages;
    const resolvedPreview = previewImageProvided
      ? previewImage
      : imagesProvided
        ? trimString(baseImages[0]) || ""
        : currentPreview;

    payload.previewImage = resolvedPreview;
    payload.images = mergePreviewIntoImages(resolvedPreview, baseImages);
  }

  if (modelUrlProvided || isCreate) {
    payload.modelUrl = modelUrlProvided
      ? parseStringField(body[modelUrlField], modelUrlField, { strict: true }) || ""
      : trimString(existingProduct?.modelUrl);
  }

  return payload;
};
