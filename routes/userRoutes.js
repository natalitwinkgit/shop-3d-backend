import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  buildPublicUserResponse,
  markUserOffline,
  normalizePresenceInput,
  touchUserPresence,
} from "../services/userProfileService.js";

const router = express.Router();

// PATCH /api/users/status
router.patch("/status", protect, async (req, res) => {
  try {
    const rawStatus = String(req.body?.status || "").trim().toLowerCase();
    const userId = req.user?._id;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const updated =
      rawStatus === "offline" || rawStatus === "0" || rawStatus === "false"
        ? await markUserOffline(userId, {
            page: req.body?.page || "",
            source: "status",
          })
        : await touchUserPresence(userId, {
            ...normalizePresenceInput(req.body),
            source: "status",
          });

    return res.json(buildPublicUserResponse(updated));
  } catch (e) {
    console.error("PATCH /users/status error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
