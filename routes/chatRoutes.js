// server/routes/chatRoutes.js
import express from "express";
import { createRateLimit } from "../middleware/rateLimitMiddleware.js";
import { protect } from "../middleware/authMiddleware.js";
import { canAccessSupportConversation } from "../services/chatAccessService.js";
import {
  getConversationHistory,
  getSupportAdminProfile,
  markConversationRead,
} from "../services/adminChatService.js";
import { createGuestChatSession } from "../services/chatSessionService.js";

const router = express.Router();

const guestSessionRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many guest chat session requests. Please try again later.",
});

router.post("/guest-session", guestSessionRateLimit, async (req, res) => {
  try {
    const session = await createGuestChatSession({
      guestName: req.body?.guestName || "",
    });
    res.status(201).json(session);
  } catch (e) {
    res.status(e.statusCode || 500).json({
      message: e.message || "Failed to create guest session",
    });
  }
});

router.get("/admin-id", protect, async (req, res) => {
  try {
    const adminProfile = await getSupportAdminProfile({ currentUser: req.user });
    if (!adminProfile) return res.status(404).json({ message: "No admin found" });
    res.json({
      adminId: adminProfile.adminId,
      adminName: adminProfile.adminName || "Admin",
    });
  } catch (e) {
    res.status(500).json({ message: "Failed to get admin id" });
  }
});

router.get("/support-admin", protect, async (req, res) => {
  try {
    const adminProfile = await getSupportAdminProfile({ currentUser: req.user });
    if (!adminProfile) return res.status(404).json({ message: "No admin found" });
    res.json({
      adminId: adminProfile.adminId,
      adminName: adminProfile.adminName || "Admin",
      isAiAssistant: !!adminProfile.isAiAssistant,
    });
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

    if (
      !(await canAccessSupportConversation({
        currentUser: req.user,
        firstId: senderId,
        secondId: receiverId,
      }))
    ) {
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

    if (
      !(await canAccessSupportConversation({
        currentUser: req.user,
        firstId: userId1,
        secondId: userId2,
      }))
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const history = await getConversationHistory({ userId1, userId2 });

    res.json(history);
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
