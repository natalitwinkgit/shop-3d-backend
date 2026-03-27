import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  buildPublicUserResponse,
  markUserOffline,
  normalizePresenceInput,
  touchUserPresence,
} from "../services/userProfileService.js";

const router = express.Router();

router.get("/", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

router.post("/", protect, async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const updated = await touchUserPresence(userId, normalizePresenceInput(req.body));
    return res.json({
      ok: true,
      user: buildPublicUserResponse(updated),
    });
  } catch (error) {
    console.error("[HEARTBEAT]", error);
    return res.status(500).json({ message: "Failed to update heartbeat" });
  }
});

router.post("/offline", protect, async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const updated = await markUserOffline(userId, {
      page: req.body?.page || "",
      source: "heartbeat-offline",
    });

    return res.json({
      ok: true,
      user: buildPublicUserResponse(updated),
    });
  } catch (error) {
    console.error("[HEARTBEAT OFFLINE]", error);
    return res.status(500).json({ message: "Failed to set offline state" });
  }
});

export default router;
