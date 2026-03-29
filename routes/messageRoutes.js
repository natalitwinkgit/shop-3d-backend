import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { isAdminRole } from "../models/userModel.js";
import { getConversationHistory, markConversationRead } from "../services/adminChatService.js";

const router = express.Router();

const canAccessMessages = (req, firstId, secondId) => {
  const currentUserId = String(req.user?._id || req.user?.id || "");
  return (
    isAdminRole(req.user?.role) ||
    currentUserId === String(firstId) ||
    currentUserId === String(secondId)
  );
};

// Отримати історію повідомлень між двома користувачами
router.get("/:userId1/:userId2", protect, async (req, res) => {
  const { userId1, userId2 } = req.params;
  try {
    if (!canAccessMessages(req, userId1, userId2)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const history = await getConversationHistory({ userId1, userId2 });
    
    res.json(history);
  } catch (err) {
    res.status(500).json({ message: "Помилка сервера" });
  }
});

// Позначити повідомлення як прочитані (для адмінки)
router.patch("/read/:senderId/:receiverId", protect, async (req, res) => {
  try {
    if (!canAccessMessages(req, req.params.senderId, req.params.receiverId)) {
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
