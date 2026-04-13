import { Router } from "express";

import { getMaterials } from "../controllers/referenceDictionaryController.js";

const router = Router();

router.get("/", getMaterials);

export default router;
