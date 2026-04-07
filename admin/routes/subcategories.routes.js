import { Router } from "express";

import { listFlatSubcategories } from "../lib/adminShared.js";

const router = Router();

router.get("/subcategories", async (req, res) => {
  try {
    const rows = await listFlatSubcategories(req.query.category);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Помилка при отриманні підкатегорій" });
  }
});

export default router;
