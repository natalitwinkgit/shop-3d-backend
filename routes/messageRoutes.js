import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { canAccessSupportConversation } from "../services/chatAccessService.js";
import {
  getConversationHistoryPayload,
  getConversationPeerForViewer,
  markConversationDelivered,
  markConversationRead,
} from "../services/adminChatService.js";

const router = express.Router();

// Отримати історію повідомлень між двома користувачами
router.get("/:userId1/:userId2", protect, async (req, res) => {
  const { userId1, userId2 } = req.params;
  try {
    if (
      !(await canAccessSupportConversation({
        currentUser: req.user,
        firstId: userId1,
        secondId: userId2,
      }))
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const viewerId = String(req.user?._id || req.user?.id || "").trim();
    const peerId = await getConversationPeerForViewer({ userId1, userId2, viewerId });
    if (viewerId && peerId) {
      await markConversationDelivered({ senderId: peerId, receiverId: viewerId });
    }

    const history = await getConversationHistoryPayload({ userId1, userId2 });
    
    res.json(history);
  } catch (err) {
    res.status(500).json({ message: "Помилка сервера" });
  }
});

// Позначити повідомлення як прочитані (для адмінки)
router.patch("/read/:senderId/:receiverId", protect, async (req, res) => {
  try {
    if (
      !(await canAccessSupportConversation({
        currentUser: req.user,
        firstId: req.params.senderId,
        secondId: req.params.receiverId,
      }))
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    await markConversationRead({
      senderId: req.params.senderId,
      receiverId: req.params.receiverId,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Помилка" });
  }
});

export default router;
