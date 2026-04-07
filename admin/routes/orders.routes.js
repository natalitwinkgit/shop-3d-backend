import { Router } from "express";

import {
  adminCancelOrder,
  adminDeleteOrder,
  adminGetOrder,
  adminListOrders,
  adminPatchOrder,
} from "../../controllers/orderController.js";

const router = Router();

router.get("/orders", adminListOrders);
router.get("/orders/:id", adminGetOrder);
router.patch("/orders/:id", adminPatchOrder);
router.post("/orders/:id/cancel", adminCancelOrder);
router.delete("/orders/:id", adminDeleteOrder);

export default router;
