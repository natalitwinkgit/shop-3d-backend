// server/routes/orderRoutes.js
import express from "express";
import { z } from "zod";
import { protect } from "../middleware/authMiddleware.js";
import { admin } from "../middleware/authMiddleware.js";
import { validateZodBody } from "../app/middleware/validateZod.js";

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

const orderItemSchema = z.object({
  productId: z.string().trim().min(1),
  qty: z.number().int().positive().optional(),
});

const previewOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1),
  rewardId: z.string().trim().optional(),
});

const createOrderSchema = z.object({
  customer: z.object({
    fullName: z.string().trim().min(2),
    phone: z.string().trim().min(6),
    email: z.string().trim().optional(),
  }),
  delivery: z.object({
    city: z.string().trim().min(2),
    method: z.enum(["pickup", "courier", "nova_poshta"]),
    pickupLocationId: z.string().trim().optional(),
    address: z.string().trim().optional(),
    npOffice: z.string().trim().optional(),
  }),
  items: z.array(orderItemSchema).min(1),
  rewardId: z.string().trim().optional(),
  comment: z.string().trim().optional(),
});

/* user */
router.post(
  "/preview",
  protect,
  validateZodBody(previewOrderSchema),
  previewMyOrder
);
router.post(
  "/",
  protect,
  validateZodBody(createOrderSchema),
  createMyOrder
);
router.get("/my", protect, listMyOrders);
router.get("/my/:id", protect, getMyOrder);

/* admin */
router.get("/", protect, admin, adminListOrders);
router.get("/:id", protect, admin, adminGetOrder);
router.patch("/:id", protect, admin, adminPatchOrder);
router.post("/:id/cancel", protect, admin, adminCancelOrder);
router.delete("/:id", protect, admin, adminDeleteOrder);

export default router;
