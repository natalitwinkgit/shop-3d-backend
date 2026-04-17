// server/routes/likeRoutes.js

import express from "express";
import { listMyLikes, toggleLike } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, listMyLikes);

router.post("/", protect, toggleLike);

export default router;
