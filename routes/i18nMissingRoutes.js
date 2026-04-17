import express from "express";

import {
  createMissingTranslation,
  getI18nMissingStatus,
} from "../controllers/i18nMissingController.js";

const router = express.Router();

router.get("/", getI18nMissingStatus);
router.post("/", createMissingTranslation);

export default router;
