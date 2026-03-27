import express from "express";
import {
  getAdminAiStatus,
  sendAdminAiReply,
  suggestAdminAiReply,
} from "../controllers/adminAiController.js";

const router = express.Router();

router.get("/status", getAdminAiStatus);
router.post("/suggest", suggestAdminAiReply);
router.post("/reply", sendAdminAiReply);
router.post("/respond", sendAdminAiReply);

export default router;
