import { Router } from "express";

import {
  createManufacturer,
  createMaterial,
  deleteManufacturer,
  deleteMaterial,
  getManufacturers,
  getMaterials,
  updateManufacturer,
  updateMaterial,
} from "../../controllers/referenceDictionaryController.js";

const router = Router();

router.get("/materials", getMaterials);
router.post("/materials", createMaterial);
router.patch("/materials/:id", updateMaterial);
router.delete("/materials/:id", deleteMaterial);

router.get("/manufacturers", getManufacturers);
router.post("/manufacturers", createManufacturer);
router.patch("/manufacturers/:id", updateManufacturer);
router.delete("/manufacturers/:id", deleteManufacturer);

export default router;
