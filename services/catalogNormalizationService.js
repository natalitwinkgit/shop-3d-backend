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

export const extractProductMaterialKeys = (productDoc = {}) => {
  const specifications = productDoc?.specifications || {};
  const materialKeys = [];

  if (specifications.materialKey) materialKeys.push(specifications.materialKey);
  if (Array.isArray(specifications.materialKeys)) materialKeys.push(...specifications.materialKeys);

  if (Array.isArray(specifications.materials)) {
    specifications.materials.forEach((item) => {
      if (typeof item === "string") materialKeys.push(item);
      if (item && typeof item === "object" && item.key) materialKeys.push(item.key);
    });
  }

  return normalizeMaterialKeys(materialKeys);
};

export const normalizeProductCatalogPayload = (productDoc = {}) => ({
  ...productDoc,
  roomKeys: normalizeRoomKeys(productDoc?.roomKeys || []),
  materialKeys: extractProductMaterialKeys(productDoc),
});
