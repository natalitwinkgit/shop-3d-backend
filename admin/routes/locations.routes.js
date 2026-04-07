import { Router } from "express";

import {
  createLocation,
  getAdminLocations,
  setLocationStatus,
  updateLocation,
} from "../../controllers/locationController.js";

const router = Router();

router.get("/locations", getAdminLocations);
router.post("/locations", createLocation);
router.put("/locations/:id", updateLocation);
router.patch("/locations/:id/status", setLocationStatus);

export default router;
