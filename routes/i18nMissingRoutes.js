import express from "express";

import {
  createMissingTranslation,
  getI18nMissingStatus,
} from "../controllers/i18nMissingController.js";
import { createRateLimit } from "../middleware/rateLimitMiddleware.js";

const router = express.Router();

const i18nMissingRateLimit = createRateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: "Too many AI translation requests",
});

router.get("/", getI18nMissingStatus);
router.post("/", i18nMissingRateLimit, createMissingTranslation);

export default router;
