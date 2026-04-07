import { Router } from "express";

import SpecField from "../../models/SpecField.js";
import SpecTemplate from "../../models/SpecTemplate.js";

const router = Router();

const addSpecFieldToTemplate = async (req, res, { includeTemplate }) => {
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

    await SpecField.updateOne(
      { key: field.key },
      { $set: { ...field, isActive: true } },
      { upsert: true }
    );

    const template = await SpecTemplate.findOneAndUpdate(
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

    const sections = Array.isArray(template.sections) ? template.sections : [];
    const index = sections.findIndex((section) => section.id === sectionId);

    if (index === -1) {
      sections.push({
        id: sectionId,
        title: { ua: "Характеристики", en: "Specifications" },
        fieldKeys: [field.key],
      });
    } else {
      const keys = new Set(sections[index].fieldKeys || []);
      keys.add(field.key);
      sections[index].fieldKeys = Array.from(keys);
    }

    template.sections = sections;
    await template.save();

    return res.json(includeTemplate ? { ok: true, template } : { ok: true });
  } catch (error) {
    console.error("[ADMIN spec add-field]", error);
    return res.status(500).json({ message: "Server error" });
  }
};

router.get("/spec-templates/:typeKey", async (req, res) => {
  try {
    const typeKey = String(req.params.typeKey || "default");
    const template = await SpecTemplate.findOne({ typeKey, isActive: true }).lean();
    if (!template) return res.status(404).json({ message: "Spec template not found" });
    res.json(template);
  } catch (error) {
    console.error("[ADMIN spec template GET]", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/spec-templates/:typeKey/add-field", async (req, res) =>
  addSpecFieldToTemplate(req, res, { includeTemplate: true })
);

router.post("/spec-config/:typeKey/add-field", async (req, res) =>
  addSpecFieldToTemplate(req, res, { includeTemplate: false })
);

export default router;
