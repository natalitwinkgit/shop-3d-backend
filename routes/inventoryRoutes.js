// routes/inventoryRoutes.js
import { Router } from "express";
import { getByProduct, upsert } from "../controllers/inventoryController.js";

const router = Router();

// Отримати залишки по ID товару
router.get("/product/:productId", getByProduct);

// Створити або оновити залишки (PATCH)
router.patch("/", upsert);

export default router;