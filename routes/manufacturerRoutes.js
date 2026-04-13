import { Router } from "express";

import { getManufacturers } from "../controllers/referenceDictionaryController.js";

const router = Router();

router.get("/", getManufacturers);

export default router;
