import Inventory from "../models/Inventory.js";
import {
  buildLocationPresentation,
  loadLocationTranslations,
  resolveLocationLang,
} from "./locationPresentationService.js";

const LOCATION_SELECT =
  "_id type city cityKey name nameKey address addressKey phone workingHours coordinates isActive";

const clamp0 = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const pickStr = (value) => String(value || "").trim();

const toProductId = (productDoc = {}) =>
  pickStr(productDoc?._id) || pickStr(productDoc?.id);

const emptySummary = () => ({
  rows: 0,
  locations: 0,
  onHand: 0,
  reserved: 0,
  available: 0,
  showcaseRows: 0,
});

const createInventoryEntry = () => ({
  summary: emptySummary(),
  rows: [],
  availableLocations: [],
});

const toLocationDoc = (location) => {
  if (!location) return null;
  if (location?._id || location?.id) return location;
  return { _id: location };
};

const formatInventoryRow = (row, translations) => {
  const onHand = clamp0(row.onHand);
  const reserved = clamp0(row.reserved);
  const available = Math.max(0, onHand - reserved);
  const location = buildLocationPresentation(toLocationDoc(row.location) || {}, translations);

  const locationLabel =
    String(location.name || location.typeLabel || location.cityLabel || location.type || "").trim();

  return {
    id: pickStr(row._id),
    productId: pickStr(row.product?._id || row.product),
    locationId: location.id,
    locationType: location.type,
    city: location.city,
    cityKey: location.cityKey,
    cityLabel: location.cityLabel,
    locationName: location.name,
    locationNameKey: location.nameKey,
    locationAddress: location.address,
    addressKey: location.addressKey,
    isActive: location.isActive,
    location: locationLabel,
    locationDetails: location,
    onHand,
    reserved,
    available,
    zone: pickStr(row.zone),
    note: pickStr(row.note),
    isShowcase: !!row.isShowcase,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
};

const getProductInventoryEntries = async (
  productIds = [],
  {
    req = null,
    includeRows = false,
    onlyActiveLocations = true,
  } = {}
) => {
  const ids = Array.from(new Set(productIds.map((id) => pickStr(id)).filter(Boolean)));
  const entries = new Map(ids.map((id) => [id, createInventoryEntry()]));
  if (!ids.length) return entries;

  const [rows, translations] = await Promise.all([
    Inventory.find({ product: { $in: ids } })
      .populate("location", LOCATION_SELECT)
      .sort({ isShowcase: -1, updatedAt: -1 })
      .lean(),
    loadLocationTranslations(resolveLocationLang(req)),
  ]);

  for (const row of rows) {
    const productId = pickStr(row.product?._id || row.product);
    if (!entries.has(productId)) continue;

    const locationDoc = toLocationDoc(row.location);
    if (!locationDoc?._id && !locationDoc?.id) continue;
    if (onlyActiveLocations && locationDoc.isActive === false) continue;

    const formatted = formatInventoryRow(row, translations);
    const entry = entries.get(productId);
    entry.summary.rows += 1;
    entry.summary.onHand += formatted.onHand;
    entry.summary.reserved += formatted.reserved;
    entry.summary.available += formatted.available;
    if (formatted.isShowcase) entry.summary.showcaseRows += 1;

    if (includeRows) {
      entry.rows.push(formatted);
    }

    if (formatted.available > 0) {
      entry.availableLocations.push(formatted);
    }
  }

  for (const entry of entries.values()) {
    const locationIds = new Set(entry.availableLocations.map((row) => row.locationId).filter(Boolean));
    entry.summary.locations = locationIds.size;
  }

  return entries;
};

const attachEntryToProduct = (productDoc = {}, entry = createInventoryEntry(), includeRows = false) => {
  const summary = entry.summary || emptySummary();
  const hasStock = summary.available > 0;
  const nextProduct = {
    ...productDoc,
    onHandTotal: summary.onHand,
    reservedTotal: summary.reserved,
    availableTotal: summary.available,
    inventoryOnHand: summary.onHand,
    inventoryReserved: summary.reserved,
    inventoryAvailable: summary.available,
    inventorySummary: summary,
    availableLocations: entry.availableLocations || [],
    pickupLocations: entry.availableLocations || [],
    stockQty: summary.available,
    inStock: hasStock,
    hasStock,
  };

  if (!includeRows) return nextProduct;

  return {
    ...nextProduct,
    inventoryRows: entry.rows || [],
    inventoryByLocations: entry.rows || [],
  };
};

export const attachProductInventoryAvailability = async (
  products,
  options = {}
) => {
  const isArray = Array.isArray(products);
  const items = (isArray ? products : [products]).filter(Boolean);
  const productIds = items.map(toProductId);
  const entries = await getProductInventoryEntries(productIds, options);

  const withInventory = items.map((product) =>
    attachEntryToProduct(
      product,
      entries.get(toProductId(product)) || createInventoryEntry(),
      !!options.includeRows
    )
  );

  return isArray ? withInventory : withInventory[0] || null;
};
