import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
import fs from "fs";
import Category from "../models/Category.js";
import { protect, admin } from "../middleware/authMiddleware.js";

const router = express.Router();

const baseUploadPath = path.join(process.cwd(), "../client/public/UPLOAD/categories");

const ensureCategoryFolder = (categoryKey) => {
  const folderPath = path.join(baseUploadPath, categoryKey);
  if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
  return folderPath;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { category } = req.body;
    if (!category) return cb(new Error("Category key is required"));
    cb(null, ensureCategoryFolder(category));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

/** =========================
 *  GET ALL PARENTS
 *  /api/categories
 ========================= */
router.get("/", async (req, res) => {
  try {
    const list = await Category.find().sort({ order: 1, createdAt: -1 }).lean();
    res.json(list);
  } catch (e) {
    res.status(500).json({ message: "Помилка при отриманні категорій" });
  }
});

/** =========================
 *  GET CHILDREN
 *  /api/categories/:category/children
 ========================= */
router.get("/:category/children", async (req, res) => {
  try {
    const { category } = req.params;

    const doc = await Category.findOne({ category })
      .select("category names description image order children")
      .lean();

    if (!doc) return res.status(404).json({ message: "Категорію не знайдено" });

    res.json({
      parent: {
        category: doc.category,
        names: doc.names,
        description: doc.description || { ua: "", en: "" },
        image: doc.image,
        order: doc.order,
      },
      children: Array.isArray(doc.children) ? doc.children : [],
    });
  } catch (e) {
    res.status(500).json({ message: "Помилка при отриманні підкатегорій" });
  }
});

/** =========================
 *  ADD SUBCATEGORY
 *  POST /api/categories/:category/children
 ========================= */
router.post("/:category/children", protect, admin, async (req, res) => {
  try {
    const { category } = req.params;
    const {
      key,
      name_ua,
      name_en,
      description_ua = "",
      description_en = "",
      image = "",
      order = 0,
    } = req.body;

    if (!key || !name_ua || !name_en) {
      return res.status(400).json({ message: "key, name_ua, name_en — обов'язкові" });
    }

    const doc = await Category.findOne({ category });
    if (!doc) return res.status(404).json({ message: "Категорію не знайдено" });

    const exists = (doc.children || []).some((c) => c.key === key);
    if (exists) return res.status(409).json({ message: "Підкатегорія з таким key вже існує" });

    doc.children.push({
      key,
      names: { ua: name_ua, en: name_en },
      description: { ua: description_ua, en: description_en },
      image,
      order: Number(order) || 0,
    });

    await doc.save();
    res.status(201).json(doc);
  } catch (e) {
    res.status(500).json({ message: "Помилка при створенні підкатегорії" });
  }
});

/** =========================
 *  UPDATE SUBCATEGORY
 *  PUT /api/categories/:category/children/:key
 ========================= */
router.put("/:category/children/:key", protect, admin, async (req, res) => {
  try {
    const { category, key } = req.params;
    const { name_ua, name_en, description_ua, description_en, image, order } = req.body;

    const doc = await Category.findOne({ category });
    if (!doc) return res.status(404).json({ message: "Категорію не знайдено" });

    const idx = (doc.children || []).findIndex((c) => c.key === key);
    if (idx === -1) return res.status(404).json({ message: "Підкатегорію не знайдено" });

    if (name_ua) doc.children[idx].names.ua = name_ua;
    if (name_en) doc.children[idx].names.en = name_en;
    if (!doc.children[idx].description) {
      doc.children[idx].description = { ua: "", en: "" };
    }
    if (typeof description_ua === "string") doc.children[idx].description.ua = description_ua;
    if (typeof description_en === "string") doc.children[idx].description.en = description_en;
    if (typeof image === "string") doc.children[idx].image = image;
    if (order != null) doc.children[idx].order = Number(order) || 0;

    await doc.save();
    res.json(doc);
  } catch (e) {
    res.status(500).json({ message: "Помилка при оновленні підкатегорії" });
  }
});

/** =========================
 *  DELETE SUBCATEGORY
 *  DELETE /api/categories/:category/children/:key
 ========================= */
router.delete("/:category/children/:key", protect, admin, async (req, res) => {
  try {
    const { category, key } = req.params;

    const doc = await Category.findOne({ category });
    if (!doc) return res.status(404).json({ message: "Категорію не знайдено" });

    doc.children = (doc.children || []).filter((c) => c.key !== key);
    await doc.save();

    res.json({ message: "Підкатегорію видалено" });
  } catch (e) {
    res.status(500).json({ message: "Помилка при видаленні підкатегорії" });
  }
});

/** =========================
 *  CREATE PARENT CATEGORY (твій існуючий POST)
 *  POST /api/categories
 ========================= */
router.post("/", protect, admin, upload.single("image"), async (req, res) => {
  try {
    const { category, name_ua, name_en, description_ua = "", description_en = "", imageUrl, order = 0 } = req.body;

    if (!category || !name_ua || !name_en) {
      return res.status(400).json({ message: "Ключ та обидві назви категорії обов'язкові." });
    }

    const folderPath = ensureCategoryFolder(category);

    const image = req.file
      ? `/UPLOAD/categories/${category}/${req.file.filename}`
      : imageUrl?.trim() || "";

    const newCategory = new Category({
      category,
      image,
      order: Number(order) || 0,
      names: { ua: name_ua, en: name_en },
      description: { ua: description_ua, en: description_en },
      folderPath,
      children: [],
    });

    await newCategory.save();
    res.status(201).json(newCategory);
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ message: "Категорія з таким ключем вже існує." });
    res.status(500).json({ message: "Помилка при створенні категорії" });
  }
});

/** =========================
 *  UPDATE/DELETE BY ID (щоб не ламалось на не-ObjectId)
 ========================= */
router.put("/:id", protect, admin, upload.single("image"), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid category id" });
    }
    const currentCategory = await Category.findById(req.params.id).lean();
    if (!currentCategory) {
      return res.status(404).json({ message: "Категорію не знайдено" });
    }

    const { category, name_ua, name_en, description_ua, description_en, imageUrl, order } = req.body;

    const updateData = {};
    if (category) updateData.category = category;
    if (name_ua && name_en) updateData.names = { ua: name_ua, en: name_en };
    if (typeof description_ua === "string" || typeof description_en === "string") {
      updateData.description = {
        ua:
          typeof description_ua === "string"
            ? description_ua
            : String(currentCategory.description?.ua || ""),
        en:
          typeof description_en === "string"
            ? description_en
            : String(currentCategory.description?.en || ""),
      };
    }
    if (order != null) updateData.order = Number(order) || 0;

    if (req.file && category) updateData.image = `/UPLOAD/categories/${category}/${req.file.filename}`;
    else if (imageUrl?.trim()) updateData.image = imageUrl;

    if (category) updateData.folderPath = ensureCategoryFolder(category);

    const updated = await Category.findByIdAndUpdate(req.params.id, updateData, { new: true });

    res.json(updated);
  } catch (e) {
    res.status(500).json({ message: "Помилка при оновленні категорії" });
  }
});

router.delete("/:id", protect, admin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid category id" });
    }

    const deleted = await Category.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Категорію не знайдено" });

    const folderPath = path.join(baseUploadPath, deleted.category);
    if (fs.existsSync(folderPath)) fs.rmSync(folderPath, { recursive: true, force: true });

    res.json({ message: "Категорію успішно видалено" });
  } catch (e) {
    res.status(500).json({ message: "Помилка при видаленні категорії" });
  }
});

export default router;
