// routes/inventoryRoutes.js
import { Router } from "express";
import { getByProduct, upsert } from "../controllers/inventoryController.js";
import { protect, admin } from "../middleware/authMiddleware.js";

const router = Router();

// Отримати залишки по ID товару
router.get("/product/:productId", getByProduct);

// Створити або оновити залишки (PATCH)
router.patch("/", protect, admin, upsert);

export default router;
