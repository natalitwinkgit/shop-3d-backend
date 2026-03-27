// server/routes/orderRoutes.js
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { admin } from "../middleware/authMiddleware.js";

import {
  createMyOrder,
  previewMyOrder,
  listMyOrders,
  getMyOrder,
  adminListOrders,
  adminGetOrder,
  adminPatchOrder,
  adminCancelOrder,
  adminDeleteOrder,
} from "../controllers/orderController.js";

const router = express.Router();

/* user */
router.post("/preview", protect, previewMyOrder);
router.post("/", protect, createMyOrder);
router.get("/my", protect, listMyOrders);
router.get("/my/:id", protect, getMyOrder);

/* admin */
router.get("/", protect, admin, adminListOrders);
router.get("/:id", protect, admin, adminGetOrder);
router.patch("/:id", protect, admin, adminPatchOrder);
router.post("/:id/cancel", protect, admin, adminCancelOrder);
router.delete("/:id", protect, admin, adminDeleteOrder);

export default router;
