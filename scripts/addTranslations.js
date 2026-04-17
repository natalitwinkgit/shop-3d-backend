import dotenv from "dotenv";
import mongoose from "mongoose";
import Translation from "../models/Translation.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("MONGO_URI is not set in environment");
  process.exit(1);
}

const ua = {
  "collections.itemsLabel": "Товари",
  "collections.noPhoto": "Немає фото",
  "collections.viewCollection": "Переглянути колекцію",

  "productcollections.nordic_dining.name": "Nordic Dining",
  "productcollections.teddy_accent.name": "Teddy Accent",

  "productPage.stockTab.title": "Наявність",
  "productPage.stockTab.loading": "Завантаження...",
  "productPage.stockTab.missingProductId": "Невідомий товар",
  "productPage.stockTab.loadError": "Помилка завантаження наявності",
  "productPage.stockTab.pickLocationTitle": "Оберіть місце видачі",
  "productPage.stockTab.cityLabel": "Місто",
  "productPage.stockTab.cityPlaceholder": "Оберіть місто",
  "productPage.stockTab.pointTypeLabel": "Тип точки",
  "productPage.stockTab.pointTypePlaceholder": "Оберіть тип точки",
  "productPage.stockTab.locationLabel": "Локація",
  "productPage.stockTab.locationPlaceholder": "Оберіть локацію",
  "productPage.stockTab.rowsLabel": "Рядки",
  "productPage.stockTab.onHandLabel": "На руках",
  "productPage.stockTab.reservedLabel": "Зарезервовано",
  "productPage.stockTab.availableLabel": "Доступно",
  "productPage.stockTab.showcaseBadge": "Вітрина",
  "productPage.stockTab.zoneLabel": "Зона",
  "productPage.stockTab.noteLabel": "Примітка",
  "productPage.stockTab.quantityLabel": "Кількість",
  "productPage.stockTab.noStock": "Немає в наявності",
};

const en = {
  "collections.itemsLabel": "Items",
  "collections.noPhoto": "No photo",
  "collections.viewCollection": "View collection",

  "productcollections.nordic_dining.name": "Nordic Dining",
  "productcollections.teddy_accent.name": "Teddy Accent",

  "productPage.stockTab.title": "Availability",
  "productPage.stockTab.loading": "Loading...",
  "productPage.stockTab.missingProductId": "Product ID missing",
  "productPage.stockTab.loadError": "Failed to load stock",
  "productPage.stockTab.pickLocationTitle": "Choose pickup location",
  "productPage.stockTab.cityLabel": "City",
  "productPage.stockTab.cityPlaceholder": "Select city",
  "productPage.stockTab.pointTypeLabel": "Point type",
  "productPage.stockTab.pointTypePlaceholder": "Select point type",
  "productPage.stockTab.locationLabel": "Location",
  "productPage.stockTab.locationPlaceholder": "Select location",
  "productPage.stockTab.rowsLabel": "Rows",
  "productPage.stockTab.onHandLabel": "On hand",
  "productPage.stockTab.reservedLabel": "Reserved",
  "productPage.stockTab.availableLabel": "Available",
  "productPage.stockTab.showcaseBadge": "Showcase",
  "productPage.stockTab.zoneLabel": "Zone",
  "productPage.stockTab.noteLabel": "Note",
  "productPage.stockTab.quantityLabel": "Quantity",
  "productPage.stockTab.noStock": "Out of stock",
};

const buildSetOps = (obj, prefix = "") => {
  const ops = {};
  for (const [k, v] of Object.entries(obj)) {
    ops[k] = v;
  }
  return ops;
};

const run = async () => {
  try {
    await mongoose.connect(MONGO_URI, { dbName: process.env.MONGO_DB || undefined });
    console.log("Connected to MongoDB");

    const uaOps = buildSetOps(ua);
    const enOps = buildSetOps(en);

    const resUa = await Translation.updateOne({ lang: "ua" }, { $set: uaOps }, { upsert: true });
    console.log("UA update result:", resUa);

    const resEn = await Translation.updateOne({ lang: "en" }, { $set: enOps }, { upsert: true });
    console.log("EN update result:", resEn);

    console.log("Translations updated successfully");
  } catch (err) {
    console.error("Failed to update translations:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected");
  }
};

run();
