import express from "express";
import SpecTemplate from "../models/SpecTemplate.js";
import SpecField from "../models/SpecField.js";
import { protect, admin } from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * ✅ GET /api/spec-templates/:typeKey
 * Повертає темплейт специфікацій для конкретного typeKey
 * Напр: default, sofa_straight...
 */
router.get("/:typeKey", async (req, res) => {
  try {
    const typeKey = String(req.params.typeKey || "default");

    const tpl = await SpecTemplate.findOne({ typeKey, isActive: true }).lean();

    // Якщо нема — повертаємо 404, щоб фронт міг зробити fallback
    if (!tpl) return res.status(404).json({ message: "Spec template not found" });

    res.json(tpl);
  } catch (e) {
    console.error("GET /api/spec-templates/:typeKey error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/spec-templates/:typeKey/add-field
 * body: { sectionId?: "main", field: { key,label,kind,path,dict?,unit?,required? } }
 */
router.post("/:typeKey/add-field", protect, admin, async (req, res) => {
  try {
    const { typeKey } = req.params;
    const { sectionId = "main", field } = req.body || {};

    if (
      !field?.key ||
      !field?.label?.ua ||
      !field?.label?.en ||
      !field?.kind ||
      !field?.path
    ) {
      return res.status(400).json({ message: "Invalid field" });
    }

    // 1) upsert SpecField
    await SpecField.updateOne(
      { key: field.key },
      { $set: { ...field, isActive: true } },
      { upsert: true }
    );

    // 2) ensure SpecTemplate exists
    const tpl = await SpecTemplate.findOneAndUpdate(
      { typeKey },
      {
        $setOnInsert: {
          typeKey,
          title: { ua: typeKey, en: typeKey },
          sections: [
            {
              id: "main",
              title: { ua: "Характеристики", en: "Specifications" },
              fieldKeys: [],
            },
          ],
          isActive: true,
        },
      },
      { upsert: true, new: true }
    );

    // 3) add fieldKey into correct section
    const sections = Array.isArray(tpl.sections) ? tpl.sections : [];
    const idx = sections.findIndex((s) => s.id === sectionId);

    if (idx === -1) {
      sections.push({
        id: sectionId,
        title: { ua: "Характеристики", en: "Specifications" },
        fieldKeys: [field.key],
      });
    } else {
      const set = new Set(sections[idx].fieldKeys || []);
      set.add(field.key);
      sections[idx].fieldKeys = Array.from(set);
    }

    tpl.sections = sections;
    await tpl.save();

    res.json({ ok: true, template: tpl });
  } catch (e) {
    console.error("POST /api/spec-templates/:typeKey/add-field error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
