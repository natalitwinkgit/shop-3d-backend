const ROOM_KEY_ALIASES = {
  living_room: ["living_room", "living-room", "livingroom"],
  bedroom: ["bedroom", "bed_room", "bed-room"],
  bathroom: ["bathroom", "bath_room", "bath-room"],
  kids_room: ["kids_room", "kids-room", "children_room", "children-room", "childrens_room", "nursery"],
  home_office: ["home_office", "home-office", "office"],
  dining_room: ["dining_room", "dining-room", "diningroom"],
  hallway: ["hallway", "hall", "entryway"],
  kitchen: ["kitchen"],
};

const roomAliasLookup = new Map(
  Object.entries(ROOM_KEY_ALIASES).flatMap(([canonicalKey, aliases]) =>
    aliases.map((alias) => [alias, canonicalKey])
  )
);

const normalizeKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export const normalizeRoomKey = (value) => {
  const normalized = normalizeKey(value);
  return roomAliasLookup.get(normalized) || normalized;
};

export const normalizeRoomKeys = (values = []) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [values])
        .map((value) => normalizeRoomKey(value))
        .filter(Boolean)
    )
  );

export const expandRoomQueryKeys = (values = []) => {
  const expanded = new Set();

  normalizeRoomKeys(values).forEach((canonicalKey) => {
    expanded.add(canonicalKey);
    (ROOM_KEY_ALIASES[canonicalKey] || [canonicalKey]).forEach((alias) => {
      expanded.add(alias);
      expanded.add(normalizeKey(alias));
    });
  });

  return Array.from(expanded);
};

export const normalizeMaterialKey = (value) => normalizeKey(value);

export const normalizeMaterialKeys = (values = []) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [values])
        .map((value) => normalizeMaterialKey(value))
        .filter(Boolean)
    )
  );

const normalizeProductDimensions = (productDoc = {}) => {
  const rawDimensions =
    productDoc?.dimensions && typeof productDoc.dimensions === "object" ? productDoc.dimensions : {};
  const legacySpecifications =
    productDoc?.specifications && typeof productDoc.specifications === "object"
      ? productDoc.specifications
      : {};

  const dimensions = {
    widthCm: rawDimensions.widthCm ?? legacySpecifications.widthCm ?? null,
    depthCm: rawDimensions.depthCm ?? legacySpecifications.depthCm ?? null,
    heightCm: rawDimensions.heightCm ?? legacySpecifications.heightCm ?? null,
    lengthCm: rawDimensions.lengthCm ?? legacySpecifications.lengthCm ?? null,
    diameterCm: rawDimensions.diameterCm ?? legacySpecifications.diameterCm ?? null,
  };

  return Object.fromEntries(
    Object.entries(dimensions).filter(([, value]) => Number.isFinite(value))
  );
};

export const extractProductMaterialKeys = (productDoc = {}) => {
  const specifications = productDoc?.specifications || {};
  const materialKeys = [];

  if (specifications.materialKey) materialKeys.push(specifications.materialKey);
  if (specifications.material?.key) materialKeys.push(specifications.material.key);
  if (Array.isArray(specifications.materialKeys)) materialKeys.push(...specifications.materialKeys);

  if (Array.isArray(specifications.materials)) {
    specifications.materials.forEach((item) => {
      if (typeof item === "string") materialKeys.push(item);
      if (item && typeof item === "object" && item.key) materialKeys.push(item.key);
    });
  }

  return normalizeMaterialKeys(materialKeys);
};

const normalizeProductColors = (colors = []) =>
  (Array.isArray(colors) ? colors : [])
    .map((color) => ({
      key: String(color?.key || "").trim(),
      name: {
        ua: String(color?.name?.ua || color?.name?.uk || color?.name?.en || "").trim(),
        en: String(color?.name?.en || color?.name?.ua || color?.name?.uk || "").trim(),
      },
      hex: String(color?.hex || "").trim(),
      rgb: Array.isArray(color?.rgb) ? color.rgb.map((component) => Number(component)) : [],
      slug: color?.slug || null,
      group: color?.group || null,
      isActive: color?.isActive !== false,
    }))
    .filter((color) => color.key);

const normalizeProductColorKeys = (productDoc = {}) => {
  const rawKeys =
    Array.isArray(productDoc?.colorKeys) && productDoc.colorKeys.length
      ? productDoc.colorKeys
      : normalizeProductColors(productDoc?.colors).map((color) => color.key);

  return Array.from(
    new Set(
      rawKeys
        .map((key) => String(key || "").trim())
        .filter(Boolean)
    )
  );
};

export const normalizeProductCatalogPayload = (productDoc = {}) => ({
  ...productDoc,
  previewImage:
    (typeof productDoc?.previewImage === "string" && productDoc.previewImage.trim()) ||
    (Array.isArray(productDoc?.images) ? productDoc.images.find((item) => String(item || "").trim()) || "" : ""),
  modelUrl: typeof productDoc?.modelUrl === "string" ? productDoc.modelUrl : "",
  dimensions: normalizeProductDimensions(productDoc),
  colorKeys: normalizeProductColorKeys(productDoc),
  colors: normalizeProductColors(productDoc?.colors),
  roomKeys: normalizeRoomKeys(productDoc?.roomKeys || []),
  materialKeys: extractProductMaterialKeys(productDoc),
});
