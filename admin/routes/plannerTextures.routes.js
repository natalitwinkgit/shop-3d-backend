import { Router } from "express";

import {
  createAdminPlannerTexture,
  deleteAdminPlannerTexture,
  getAdminPlannerTextureGroups,
  getAdminPlannerTextures,
  getAdminPlannerTexturesBySurface,
  updateAdminPlannerTexture,
  updateAdminPlannerTextureAsset,
  updateAdminPlannerTextureStatus,
  uploadAdminPlannerTextureAsset,
} from "../../controllers/plannerTextureController.js";
import { plannerTextureUploadSingle } from "../../services/plannerTextureUploadService.js";

const router = Router();

router.get("/", getAdminPlannerTextures);
router.get("/grouped", getAdminPlannerTextureGroups);
router.get("/surface/:surfaceType", getAdminPlannerTexturesBySurface);
router.post("/upload", plannerTextureUploadSingle, uploadAdminPlannerTextureAsset);
router.post("/", plannerTextureUploadSingle, createAdminPlannerTexture);
router.patch("/:id/texture", plannerTextureUploadSingle, updateAdminPlannerTextureAsset);
router.patch("/:id/status", updateAdminPlannerTextureStatus);
router.patch("/:id", plannerTextureUploadSingle, updateAdminPlannerTexture);
router.delete("/:id", deleteAdminPlannerTexture);

export default router;
