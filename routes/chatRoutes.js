// server/routes/chatRoutes.js
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getConversationHistory,
  getSupportAdminProfile,
  markConversationRead,
} from "../services/adminChatService.js";

const router = express.Router();

const canAccessChat = (req, firstId, secondId) => {
  const currentUserId = String(req.user?._id || req.user?.id || "");
  return req.user?.role === "admin" || currentUserId === String(firstId) || currentUserId === String(secondId);
};

router.get("/admin-id", async (req, res) => {
  try {
    const adminProfile = await getSupportAdminProfile();
    if (!adminProfile) return res.status(404).json({ message: "No admin found" });
    res.json({ adminId: adminProfile.adminId });
  } catch (e) {
    res.status(500).json({ message: "Failed to get admin id" });
  }
});

router.get("/support-admin", async (req, res) => {
  try {
    const adminProfile = await getSupportAdminProfile();
    if (!adminProfile) return res.status(404).json({ message: "No admin found" });
    res.json({ adminId: adminProfile.adminId });
  } catch (e) {
    res.status(500).json({ message: "Failed to get admin id" });
  }
});

/**
 * PATCH /api/chat/read/:senderId/:receiverId
 * Позначити повідомлення як прочитані: sender -> receiver
 */
router.patch("/read/:senderId/:receiverId", protect, async (req, res) => {
  try {
    const { senderId, receiverId } = req.params;

    if (!senderId || !receiverId) {
      return res.status(400).json({ message: "senderId and receiverId required" });
    }

    if (!canAccessChat(req, senderId, receiverId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    await markConversationRead({ senderId, receiverId });

    res.status(204).end();
  } catch (e) {
    res.status(500).json({ message: "Failed to mark read" });
  }
});

/**
 * GET /api/chat/:userId1/:userId2
 * Історія чату
 */
router.get("/:userId1/:userId2", protect, async (req, res) => {
  try {
    const { userId1, userId2 } = req.params;
    if (!userId1 || !userId2) {
      return res.status(400).json({ message: "Two user ids required" });
    }

    if (!canAccessChat(req, userId1, userId2)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const history = await getConversationHistory({ userId1, userId2 });

    res.json(history);
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
