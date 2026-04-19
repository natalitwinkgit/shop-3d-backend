import { createHttpError } from "./productPayloadService.js";

export const PLANNER_TEXTURE_SURFACE_TYPES = ["floor", "wall", "door"];

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

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

export const normalizePlannerTextureKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

export const normalizePlannerTextureTranslationKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "");

export const buildPlannerTextureTranslationKey = (surfaceType, key) =>
  normalizePlannerTextureTranslationKey(`planner.textures.${surfaceType}.${key}`);

export const parsePlannerTextureBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
};

const parsePlannerTextureNumber = (
  value,
  fieldName,
  { required = false, min = null, fallback } = {}
) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    if (required) throw createHttpError(400, `${fieldName} is required`);
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw createHttpError(400, `${fieldName} must be a number`);
  }
  if (min !== null && parsed < min) {
    throw createHttpError(400, `${fieldName} must be at least ${min}`);
  }
  return parsed;
};

export const parsePlannerTextureSurfaceType = (value, fieldName = "surfaceType") => {
  const normalized = trimString(value).toLowerCase();
  if (!PLANNER_TEXTURE_SURFACE_TYPES.includes(normalized)) {
    throw createHttpError(
      400,
      `${fieldName} must be one of: ${PLANNER_TEXTURE_SURFACE_TYPES.join(", ")}`
    );
  }
  return normalized;
};

const resolveLocalizedInput = (body = {}, fieldName, existingValue = null) => {
  const rawValue = hasOwn(body, fieldName) ? tryParseJson(body[fieldName]) : undefined;
  const rawUa = [body[`${fieldName}_ua`], body[`${fieldName}Ua`], body[`${fieldName}.ua`]].find(
    (item) => item !== undefined
  );
  const rawEn = [body[`${fieldName}_en`], body[`${fieldName}En`], body[`${fieldName}.en`]].find(
    (item) => item !== undefined
  );
  const rawUk = [body[`${fieldName}_uk`], body[`${fieldName}Uk`], body[`${fieldName}.uk`]].find(
    (item) => item !== undefined
  );
  const hasInput = rawValue !== undefined || rawUa !== undefined || rawEn !== undefined || rawUk !== undefined;

  if (!hasInput) {
    return existingValue
      ? {
          ua: trimString(existingValue?.ua),
          uk: trimString(existingValue?.uk || existingValue?.ua),
          en: trimString(existingValue?.en),
        }
      : undefined;
  }

  let ua = "";
  let uk = "";
  let en = "";

  if (typeof rawValue === "string") {
    ua = rawValue.trim();
    uk = rawValue.trim();
    en = rawValue.trim();
  } else if (isPlainObject(rawValue)) {
    ua = trimString(rawValue.ua ?? rawValue.uk ?? rawValue.en);
    uk = trimString(rawValue.uk ?? rawValue.ua ?? rawValue.en);
    en = trimString(rawValue.en ?? rawValue.ua ?? rawValue.uk);
  } else if (rawValue !== undefined) {
    throw createHttpError(400, `${fieldName} must be a string or localized object`);
  }

  if (rawUa !== undefined) ua = trimString(rawUa);
  if (rawUk !== undefined) uk = trimString(rawUk);
  if (rawEn !== undefined) en = trimString(rawEn);

  ua = ua || uk || trimString(existingValue?.ua) || trimString(existingValue?.uk) || en;
  uk = uk || ua || trimString(existingValue?.uk) || trimString(existingValue?.ua) || en;
  en = en || trimString(existingValue?.en) || ua;

  if (!ua || !en) {
    throw createHttpError(400, `${fieldName}.uk/name.ua and ${fieldName}.en are required`);
  }

  return { ua, uk, en };
};

const resolveAliasedFieldValue = (body = {}, fieldNames = []) => {
  for (const fieldName of fieldNames) {
    if (hasOwn(body, fieldName)) return body[fieldName];
  }
  return undefined;
};

const parseOptionalUrlField = (value, fieldName, fallback = "") => {
  if (value === undefined) return fallback;
  const normalized = trimString(value);
  if (!normalized) return "";
  if (!/^https?:\/\//i.test(normalized)) {
    throw createHttpError(400, `${fieldName} must be an absolute URL`);
  }
  return normalized;
};

export const parsePlannerTextureUrlField = (value, fieldName, fallback = "") =>
  parseOptionalUrlField(value, fieldName, fallback);

export const createPlannerTextureSurfaceGroups = () => ({
  floor: [],
  wall: [],
  door: [],
});

export const groupPlannerTexturesBySurface = (items = []) =>
  items.reduce((acc, item) => {
    const surfaceType = parsePlannerTextureSurfaceType(item?.surfaceType || "floor");
    acc[surfaceType].push(item);
    return acc;
  }, createPlannerTextureSurfaceGroups());

const parseRepeatValue = (body = {}, existingRepeat = null, partial = false) => {
  const repeatValue = hasOwn(body, "repeat") ? tryParseJson(body.repeat) : undefined;
  const repeatX = resolveAliasedFieldValue(body, ["repeatX", "repeat_x"]);
  const repeatY = resolveAliasedFieldValue(body, ["repeatY", "repeat_y"]);
  const hasInput = repeatValue !== undefined || repeatX !== undefined || repeatY !== undefined;

  if (!hasInput && partial) return undefined;

  if (repeatValue !== undefined && !isPlainObject(repeatValue)) {
    throw createHttpError(400, "repeat must be an object");
  }

  const nextRepeat = {
    x: Number(existingRepeat?.x) > 0 ? Number(existingRepeat.x) : 1,
    y: Number(existingRepeat?.y) > 0 ? Number(existingRepeat.y) : 1,
  };

  if (!partial && !hasInput) {
    return nextRepeat;
  }

  if (repeatValue?.x !== undefined) {
    nextRepeat.x = parsePlannerTextureNumber(repeatValue.x, "repeat.x", { min: 0.01 });
  }
  if (repeatValue?.y !== undefined) {
    nextRepeat.y = parsePlannerTextureNumber(repeatValue.y, "repeat.y", { min: 0.01 });
  }
  if (repeatX !== undefined) {
    nextRepeat.x = parsePlannerTextureNumber(repeatX, "repeat.x", { min: 0.01 });
  }
  if (repeatY !== undefined) {
    nextRepeat.y = parsePlannerTextureNumber(repeatY, "repeat.y", { min: 0.01 });
  }

  return nextRepeat;
};

export const buildPlannerTexturePayload = ({ body = {}, existingTexture = null, partial = false } = {}) => {
  const payload = {};
  const isCreate = !existingTexture && !partial;

  const rawNameValue = hasOwn(body, "name") ? tryParseJson(body.name) : undefined;
  const keySource =
    resolveAliasedFieldValue(body, ["key", "slug"]) ||
    (typeof rawNameValue === "string"
      ? rawNameValue
      : rawNameValue?.en || rawNameValue?.uk || rawNameValue?.ua) ||
    body.name_en ||
    body.name_uk ||
    body.name_ua ||
    existingTexture?.key ||
    "";

  if (hasOwn(body, "key") || hasOwn(body, "slug") || isCreate) {
    const nextKey = normalizePlannerTextureKey(resolveAliasedFieldValue(body, ["key"]) || keySource);
    if (!nextKey) throw createHttpError(400, "key is required");
    payload.key = nextKey;
  }

  if (hasOwn(body, "slug") || hasOwn(body, "key") || isCreate) {
    const nextSlug = normalizePlannerTextureKey(resolveAliasedFieldValue(body, ["slug"]) || payload.key || keySource);
    if (!nextSlug) throw createHttpError(400, "slug is required");
    payload.slug = nextSlug;
  }

  const name = resolveLocalizedInput(body, "name", existingTexture?.name);
  if (name !== undefined) {
    payload.name = name;
  } else if (isCreate) {
    throw createHttpError(400, "name.ua and name.en are required");
  }

  if (hasOwn(body, "surfaceType") || isCreate) {
    payload.surfaceType = parsePlannerTextureSurfaceType(
      body.surfaceType ?? existingTexture?.surfaceType,
      "surfaceType"
    );
  }

  const rawTranslationKey = resolveAliasedFieldValue(body, [
    "translationKey",
    "i18nKey",
    "nameKey",
  ]);
  if (rawTranslationKey !== undefined || isCreate || !existingTexture?.translationKey) {
    const nextTranslationKey = normalizePlannerTextureTranslationKey(
      rawTranslationKey ||
        existingTexture?.translationKey ||
        buildPlannerTextureTranslationKey(
          payload.surfaceType || existingTexture?.surfaceType,
          payload.key || existingTexture?.key || keySource
        )
    );
    if (!nextTranslationKey) throw createHttpError(400, "translationKey is required");
    payload.translationKey = nextTranslationKey;
  }

  const rawTextureUrl = resolveAliasedFieldValue(body, ["textureUrl", "url", "imageUrl"]);
  if (rawTextureUrl !== undefined || isCreate) {
    const textureUrl = parseOptionalUrlField(
      rawTextureUrl ?? existingTexture?.textureUrl,
      "textureUrl"
    );
    if (!textureUrl) throw createHttpError(400, "textureUrl is required");
    payload.textureUrl = textureUrl;
  }

  const previewUrl = parseOptionalUrlField(
    resolveAliasedFieldValue(body, ["previewUrl", "thumbnailUrl", "thumbUrl"]),
    "previewUrl",
    existingTexture?.previewUrl || payload.textureUrl || existingTexture?.textureUrl || ""
  );
  if (
    resolveAliasedFieldValue(body, ["previewUrl", "thumbnailUrl", "thumbUrl"]) !== undefined ||
    isCreate ||
    (!partial && !existingTexture?.previewUrl)
  ) {
    payload.previewUrl = previewUrl || payload.textureUrl || existingTexture?.textureUrl || "";
  }

  if (hasOwn(body, "cloudinaryPublicId")) {
    payload.cloudinaryPublicId = trimString(body.cloudinaryPublicId) || null;
  } else if (isCreate && existingTexture?.cloudinaryPublicId === undefined) {
    payload.cloudinaryPublicId = null;
  }

  if (hasOwn(body, "mimeType") || isCreate) {
    payload.mimeType = trimString(body.mimeType ?? existingTexture?.mimeType);
  }

  if (hasOwn(body, "width") || isCreate) {
    payload.width = parsePlannerTextureNumber(body.width ?? existingTexture?.width, "width", {
      min: 0,
      fallback: 0,
    });
  }

  if (hasOwn(body, "height") || isCreate) {
    payload.height = parsePlannerTextureNumber(body.height ?? existingTexture?.height, "height", {
      min: 0,
      fallback: 0,
    });
  }

  if (hasOwn(body, "isSeamless") || isCreate) {
    payload.isSeamless = parsePlannerTextureBoolean(
      body.isSeamless,
      existingTexture?.isSeamless ?? true
    );
  }

  const repeat = parseRepeatValue(body, existingTexture?.repeat, partial);
  if (repeat !== undefined) payload.repeat = repeat;

  for (const fieldName of ["normalMapUrl", "roughnessMapUrl", "aoMapUrl", "metalnessMapUrl"]) {
    if (hasOwn(body, fieldName) || isCreate) {
      payload[fieldName] = parseOptionalUrlField(
        body[fieldName] ?? existingTexture?.[fieldName],
        fieldName,
        existingTexture?.[fieldName] || ""
      );
    }
  }

  if (hasOwn(body, "sortOrder") || isCreate) {
    payload.sortOrder = parsePlannerTextureNumber(
      body.sortOrder ?? existingTexture?.sortOrder,
      "sortOrder",
      { fallback: 0 }
    );
  }

  if (hasOwn(body, "isActive") || isCreate) {
    payload.isActive = parsePlannerTextureBoolean(body.isActive, existingTexture?.isActive ?? true);
  }

  return payload;
};

export const buildPlannerTextureAssetPayload = ({
  body = {},
  existingTexture = null,
  uploadedAsset = null,
} = {}) => {
  const payload = {};
  const rawTextureUrl = resolveAliasedFieldValue(body, ["textureUrl", "url", "imageUrl"]);
  const rawPreviewUrl = resolveAliasedFieldValue(body, ["previewUrl", "thumbnailUrl", "thumbUrl"]);

  if (uploadedAsset) {
    payload.textureUrl = uploadedAsset.textureUrl;
    payload.previewUrl = uploadedAsset.previewUrl || uploadedAsset.textureUrl;
    payload.cloudinaryPublicId = uploadedAsset.cloudinaryPublicId || null;
    payload.mimeType = uploadedAsset.mimeType || "";
    payload.width = Number(uploadedAsset.width || 0);
    payload.height = Number(uploadedAsset.height || 0);
  } else if (rawTextureUrl !== undefined) {
    const textureUrl = parseOptionalUrlField(
      rawTextureUrl,
      "textureUrl",
      existingTexture?.textureUrl || ""
    );
    if (!textureUrl) throw createHttpError(400, "textureUrl is required");
    payload.textureUrl = textureUrl;
  }

  if (!payload.textureUrl && rawPreviewUrl !== undefined) {
    throw createHttpError(400, "textureUrl is required when previewUrl is provided");
  }

  if (rawPreviewUrl !== undefined || uploadedAsset) {
    payload.previewUrl = parseOptionalUrlField(
      rawPreviewUrl,
      "previewUrl",
      payload.textureUrl || existingTexture?.textureUrl || existingTexture?.previewUrl || ""
    );
  }

  for (const fieldName of ["normalMapUrl", "roughnessMapUrl", "aoMapUrl", "metalnessMapUrl"]) {
    if (hasOwn(body, fieldName)) {
      payload[fieldName] = parseOptionalUrlField(
        body[fieldName],
        fieldName,
        existingTexture?.[fieldName] || ""
      );
    }
  }

  if (uploadedAsset && !hasOwn(body, "cloudinaryPublicId")) {
    payload.cloudinaryPublicId = uploadedAsset.cloudinaryPublicId || null;
  } else if (hasOwn(body, "cloudinaryPublicId")) {
    payload.cloudinaryPublicId = trimString(body.cloudinaryPublicId) || null;
  }

  if (hasOwn(body, "mimeType")) {
    payload.mimeType = trimString(body.mimeType);
  }
  if (hasOwn(body, "width")) {
    payload.width = parsePlannerTextureNumber(body.width, "width", { min: 0, fallback: 0 });
  }
  if (hasOwn(body, "height")) {
    payload.height = parsePlannerTextureNumber(body.height, "height", { min: 0, fallback: 0 });
  }

  if (!payload.textureUrl) {
    throw createHttpError(400, "textureUrl or file is required");
  }

  return payload;
};

export const serializePlannerTexture = (texture = {}) => ({
  id: String(texture._id || texture.id || ""),
  _id: String(texture._id || texture.id || ""),
  key: trimString(texture.key),
  slug: trimString(texture.slug),
  translationKey: trimString(
    texture.translationKey || buildPlannerTextureTranslationKey(texture.surfaceType, texture.key)
  ),
  i18nKey: trimString(
    texture.translationKey || buildPlannerTextureTranslationKey(texture.surfaceType, texture.key)
  ),
  name: {
    ua: trimString(texture.name?.ua || texture.name?.en),
    uk: trimString(texture.name?.uk || texture.name?.ua || texture.name?.en),
    en: trimString(texture.name?.en || texture.name?.uk || texture.name?.ua),
  },
  surfaceType: trimString(texture.surfaceType),
  textureUrl: trimString(texture.textureUrl),
  previewUrl: trimString(texture.previewUrl || texture.textureUrl),
  isSeamless: texture.isSeamless !== false,
  repeat: {
    x: Number(texture.repeat?.x) > 0 ? Number(texture.repeat.x) : 1,
    y: Number(texture.repeat?.y) > 0 ? Number(texture.repeat.y) : 1,
  },
  sortOrder: Number(texture.sortOrder || 0),
  isActive: texture.isActive !== false,
  cloudinaryPublicId: texture.cloudinaryPublicId || null,
  mimeType: trimString(texture.mimeType),
  width: Number(texture.width || 0),
  height: Number(texture.height || 0),
  normalMapUrl: trimString(texture.normalMapUrl),
  roughnessMapUrl: trimString(texture.roughnessMapUrl),
  aoMapUrl: trimString(texture.aoMapUrl),
  metalnessMapUrl: trimString(texture.metalnessMapUrl),
  createdAt: texture.createdAt || null,
  updatedAt: texture.updatedAt || null,
});
