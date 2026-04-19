import { Router } from "express";

import {
  getPlannerTextureById,
  getPlannerTextureGroups,
  getPlannerTextures,
  getPlannerTexturesBySurface,
} from "../controllers/plannerTextureController.js";

const router = Router();

router.get("/", getPlannerTextures);
router.get("/grouped", getPlannerTextureGroups);
router.get("/surface/:surfaceType", getPlannerTexturesBySurface);
router.get("/:id", getPlannerTextureById);

export default router;
