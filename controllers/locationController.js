import Location from "../models/Location.js";
import {
  buildLocationPresentation,
  loadLocationTranslations,
  resolveLocationLang,
} from "../services/locationPresentationService.js";

const LOCATION_TYPES = new Set(["shop", "showroom", "office", "warehouse"]);

const pickStr = (value) => String(value || "").trim();
const toKey = (value) =>
  pickStr(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const toBool = (value) => String(value) === "true" || String(value) === "1" || value === true;

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeLocationPayload = (body = {}, { partial = false } = {}) => {
  const payload = {};

  const type = pickStr(body.type).toLowerCase();
  if (type || !partial) {
    if (!LOCATION_TYPES.has(type)) {
      const err = new Error("type must be one of: shop, showroom, office, warehouse");
      err.statusCode = 400;
      throw err;
    }
    payload.type = type;
  }

  if ("city" in body || !partial) payload.city = pickStr(body.city);
  if ("city" in body || "cityKey" in body || !partial) {
    payload.cityKey = toKey(body.cityKey || body.city);
  }
  if ("name" in body || !partial) payload.name = pickStr(body.name);
  if ("nameKey" in body || !partial) payload.nameKey = pickStr(body.nameKey);
  if ("address" in body || !partial) payload.address = pickStr(body.address);
  if ("addressKey" in body || !partial) payload.addressKey = pickStr(body.addressKey);
  if ("phone" in body) payload.phone = pickStr(body.phone);
  if ("isActive" in body) payload.isActive = toBool(body.isActive);

  const lat = body?.coordinates?.lat ?? body?.lat;
  const lng = body?.coordinates?.lng ?? body?.lng;
  if (lat !== undefined || lng !== undefined || !partial) {
    payload.coordinates = {
      lat: toNumber(lat),
      lng: toNumber(lng),
    };
  }

  const workingHoursUa = body?.workingHours?.ua ?? body?.workingHoursUa;
  const workingHoursEn = body?.workingHours?.en ?? body?.workingHoursEn;
  if (workingHoursUa !== undefined || workingHoursEn !== undefined || !partial) {
    payload.workingHours = {
      ua: pickStr(workingHoursUa),
      en: pickStr(workingHoursEn),
    };
  }

  return payload;
};

const mapLocationsForResponse = async (req, docs = []) => {
  const translations = await loadLocationTranslations(resolveLocationLang(req));
  return docs.map((doc) => buildLocationPresentation(doc, translations));
};

export const getLocations = async (req, res) => {
  try {
    const locations = await Location.find({ isActive: true }).sort({ city: 1, type: 1 }).lean();
    res.status(200).json(await mapLocationsForResponse(req, locations));
  } catch (error) {
    console.error("❌ Помилка в getLocations:", error.message);
    res.status(500).json({ message: "Помилка сервера при отриманні локацій" });
  }
};

export const getAdminLocations = async (req, res) => {
  try {
    const onlyActive = req.query.active === "true";
    const filter = onlyActive ? { isActive: true } : {};
    const locations = await Location.find(filter).sort({ isActive: -1, city: 1, type: 1 }).lean();
    const items = await mapLocationsForResponse(req, locations);

    res.status(200).json({
      items,
      total: locations.length,
    });
  } catch (error) {
    console.error("❌ Помилка в getAdminLocations:", error.message);
    res.status(500).json({ message: "Помилка сервера при отриманні локацій" });
  }
};

export const createLocation = async (req, res) => {
  try {
    const payload = normalizeLocationPayload(req.body, { partial: false });
    const newLoc = new Location(payload);
    await newLoc.save();
    const [item] = await mapLocationsForResponse(req, [newLoc.toObject()]);
    res.status(201).json(item);
  } catch (error) {
    console.error("❌ Помилка в createLocation:", error.message);
    res.status(error.statusCode || 400).json({ message: error.message });
  }
};

export const updateLocation = async (req, res) => {
  try {
    const payload = normalizeLocationPayload(req.body, { partial: true });
    const updated = await Location.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ message: "Локацію не знайдено" });
    }

    const [item] = await mapLocationsForResponse(req, [updated]);
    res.json(item);
  } catch (error) {
    console.error("❌ Помилка в updateLocation:", error.message);
    res.status(error.statusCode || 400).json({ message: error.message });
  }
};

export const setLocationStatus = async (req, res) => {
  try {
    const isActive = toBool(req.body?.isActive);
    const updated = await Location.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive } },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ message: "Локацію не знайдено" });
    }

    const [item] = await mapLocationsForResponse(req, [updated]);
    res.json(item);
  } catch (error) {
    console.error("❌ Помилка в setLocationStatus:", error.message);
    res.status(error.statusCode || 400).json({ message: error.message });
  }
};
