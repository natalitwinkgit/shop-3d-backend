// server/routes/subCategoryRoutes.js
import express from "express";
import Category from "../models/Category.js";

const router = express.Router();

/**
 * GET /api/subcategories
 * Optional: ?category=sofas
 * Возвращает плоский список сабкатегорий из Category.children
 */
router.get("/", async (req, res) => {
  try {
    const { category } = req.query;

    const q = {};
    if (category) q.category = String(category);

    const parents = await Category.find(q)
      .select("category names description children")
      .sort({ order: 1, createdAt: -1 })
      .lean();

    const rows = [];
    for (const p of parents) {
      const children = Array.isArray(p.children) ? p.children : [];
      for (const c of children) {
        rows.push({
          parentCategory: p.category,
          parentNames: p.names,
          parentDescription: p.description || { ua: "", en: "" },
          key: c.key,
          names: c.names,
          description: c.description || { ua: "", en: "" },
          image: c.image || "",
          order: Number(c.order) || 0,
          // составной идентификатор для фронта:
          id: `${p.category}:${c.key}`,
        });
      }
    }

    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: "Помилка при отриманні підкатегорій" });
  }
});

export default router;
