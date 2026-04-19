import { Router } from "express";

import Category from "../../models/Category.js";
import { adminUpload } from "../lib/adminShared.js";
import {
  assertCategoryCanDelete,
  assertSubCategoryCanDelete,
} from "../../services/catalogIntegrityService.js";

const router = Router();

router.get("/categories", async (_req, res) => {
  try {
    const items = await Category.find({}).sort({ order: 1, createdAt: -1 }).lean();
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: "Failed to load categories" });
  }
});

router.get("/categories/:category/children", async (req, res) => {
  try {
    const doc = await Category.findOne({ category: req.params.category })
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
  } catch (error) {
    res.status(500).json({ message: "Помилка при отриманні підкатегорій" });
  }
});

router.post("/categories/:category/children", async (req, res) => {
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
    } = req.body || {};

    if (!key || !name_ua || !name_en) {
      return res.status(400).json({ message: "key, name_ua, name_en - required" });
    }

    const doc = await Category.findOne({ category });
    if (!doc) return res.status(404).json({ message: "Категорію не знайдено" });

    const exists = (doc.children || []).some((child) => child.key === key);
    if (exists) {
      return res.status(409).json({ message: "Підкатегорія з таким key вже існує" });
    }

    doc.children.push({
      key,
      names: { ua: name_ua, en: name_en },
      description: { ua: description_ua, en: description_en },
      image,
      order: Number(order) || 0,
    });

    await doc.save();
    res.status(201).json(doc);
  } catch (error) {
    console.error("[ADMIN categories children POST]", error);
    res.status(500).json({ message: "Помилка при створенні підкатегорії" });
  }
});

router.put("/categories/:category/children/:key", async (req, res) => {
  try {
    const { category, key } = req.params;
    const { name_ua, name_en, description_ua, description_en, image, order } = req.body || {};

    const doc = await Category.findOne({ category });
    if (!doc) return res.status(404).json({ message: "Категорію не знайдено" });

    const index = (doc.children || []).findIndex((child) => child.key === key);
    if (index === -1) {
      return res.status(404).json({ message: "Підкатегорію не знайдено" });
    }

    if (name_ua) doc.children[index].names.ua = name_ua;
    if (name_en) doc.children[index].names.en = name_en;
    if (!doc.children[index].description) {
      doc.children[index].description = { ua: "", en: "" };
    }
    if (typeof description_ua === "string") doc.children[index].description.ua = description_ua;
    if (typeof description_en === "string") doc.children[index].description.en = description_en;
    if (typeof image === "string") doc.children[index].image = image;
    if (order != null) doc.children[index].order = Number(order) || 0;

    await doc.save();
    res.json(doc);
  } catch (error) {
    console.error("[ADMIN categories children PUT]", error);
    res.status(500).json({ message: "Помилка при оновленні підкатегорії" });
  }
});

router.delete("/categories/:category/children/:key", async (req, res) => {
  try {
    const { category, key } = req.params;
    const doc = await Category.findOne({ category });
    if (!doc) return res.status(404).json({ message: "Категорію не знайдено" });

    await assertSubCategoryCanDelete({ category, subCategory: key });

    doc.children = (doc.children || []).filter((child) => child.key !== key);
    await doc.save();

    res.json({ message: "Підкатегорію видалено" });
  } catch (error) {
    console.error("[ADMIN categories children DELETE]", error);
    res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Помилка при видаленні підкатегорії",
    });
  }
});

router.post("/categories", adminUpload.single("image"), async (req, res) => {
  try {
    const {
      category,
      name_ua,
      name_en,
      description_ua = "",
      description_en = "",
      order,
      imageUrl,
    } = req.body || {};
    if (!category || !name_ua || !name_en) {
      return res.status(400).json({ message: "category + name_ua + name_en are required" });
    }

    const image = req.file
      ? `/uploads/categories/${req.file.filename}`
      : (String(imageUrl || "").trim() || "");

    const doc = await Category.create({
      category: String(category).trim(),
      names: { ua: String(name_ua || ""), en: String(name_en || "") },
      description: { ua: String(description_ua || ""), en: String(description_en || "") },
      order: Number(order || 0),
      image,
      children: [],
    });

    res.status(201).json(doc);
  } catch (error) {
    console.error("[ADMIN categories POST]", error);
    res.status(400).json({ message: "Create category failed" });
  }
});

router.put("/categories/:id", adminUpload.single("image"), async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });

    const { name_ua, name_en, description_ua, description_en, order, imageUrl } = req.body || {};
    category.names = {
      ua: String(name_ua ?? category.names?.ua ?? ""),
      en: String(name_en ?? category.names?.en ?? ""),
    };
    category.description = {
      ua: String(description_ua ?? category.description?.ua ?? ""),
      en: String(description_en ?? category.description?.en ?? ""),
    };
    category.order = Number(order ?? category.order ?? 0);

    if (req.file) {
      category.image = `/uploads/categories/${req.file.filename}`;
    } else if (typeof imageUrl === "string") {
      category.image = imageUrl.trim();
    }

    const saved = await category.save();
    res.json(saved);
  } catch (error) {
    console.error("[ADMIN categories PUT]", error);
    res.status(400).json({ message: "Update category failed" });
  }
});

router.delete("/categories/:id", async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });

    await assertCategoryCanDelete(category.category);
    await category.deleteOne();
    res.json({ ok: true });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Delete category failed",
    });
  }
});

export default router;
