import express from "express";
import { getColors, searchColors, getNearestColor } from "../controllers/colorController.js";

const router = express.Router();

router.get("/", getColors);
router.get("/search", searchColors);
router.get("/nearest", getNearestColor);

export default router;
