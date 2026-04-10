import { Router } from "express";
import {
  getAdminAiSettings,
  getAdminSettingsOverview,
  getMyAdminAccount,
  updateAdminAiSettings,
  updateMyAdminAccount,
} from "../../controllers/adminSettingsController.js";

const router = Router();

router.get("/", getAdminSettingsOverview);
router.put("/", updateAdminAiSettings);
router.patch("/", updateAdminAiSettings);

router.get("/me", getMyAdminAccount);
router.put("/me", updateMyAdminAccount);
router.patch("/me", updateMyAdminAccount);

router.get("/ai", getAdminAiSettings);
router.put("/ai", updateAdminAiSettings);
router.patch("/ai", updateAdminAiSettings);

export default router;
