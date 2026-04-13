import { Router } from "express";

import {
  getByLocation,
  getByProduct,
  getMovements,
  getOverview,
  remove,
  transfer,
  upsert,
} from "../../controllers/inventoryController.js";

const router = Router();

router.get("/inventory/overview", getOverview);
router.get("/inventory/location/:locationId", getByLocation);
router.get("/inventory/product/:productId", getByProduct);
router.patch("/inventory", upsert);
router.delete("/inventory/:id", remove);
router.post("/inventory/transfer", transfer);
router.get("/inventory/movements", getMovements);

export default router;
