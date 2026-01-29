// server/routes/chatRoutes.js
import express from "express";
import User from "../models/userModel.js";
import Message from "../models/Message.js";

const router = express.Router();

/**
 * GET /api/chat/admin-id
 * (alias: /api/chat/support-admin)
 * Повертає _id адміна, який є “підтримкою”.
 */
router.get("/admin-id", async (req, res) => {
  try {
    const supportEmail = process.env.SUPPORT_ADMIN_EMAIL;

    let admin = null;

    if (supportEmail) {
      admin = await User.findOne({ email: supportEmail, role: "admin" }).select("_id").lean();
    }

    if (!admin) {
      admin = await User.findOne({ role: "admin" }).select("_id").lean();
    }

    if (!admin) return res.status(404).json({ message: "No admin found" });

    res.json({ adminId: String(admin._id) });
  } catch (e) {
    res.status(500).json({ message: "Failed to get admin id" });
  }
});

// ✅ alias, щоб фронт міг викликати /support-admin
router.get("/support-admin", async (req, res) => {
  try {
    const supportEmail = process.env.SUPPORT_ADMIN_EMAIL;

    let admin = null;

    if (supportEmail) {
      admin = await User.findOne({ email: supportEmail, role: "admin" }).select("_id").lean();
    }

    if (!admin) {
      admin = await User.findOne({ role: "admin" }).select("_id").lean();
    }

    if (!admin) return res.status(404).json({ message: "No admin found" });

    res.json({ adminId: String(admin._id) });
  } catch (e) {
    res.status(500).json({ message: "Failed to get admin id" });
  }
});

/**
 * PATCH /api/chat/read/:senderId/:receiverId
 * Позначити повідомлення як прочитані: sender -> receiver
 */
router.patch("/read/:senderId/:receiverId", async (req, res) => {
  try {
    const { senderId, receiverId } = req.params;

    if (!senderId || !receiverId) {
      return res.status(400).json({ message: "senderId and receiverId required" });
    }

    await Message.updateMany(
      { sender: String(senderId), receiver: String(receiverId), isRead: false },
      { $set: { isRead: true } }
    );

    res.status(204).end();
  } catch (e) {
    res.status(500).json({ message: "Failed to mark read" });
  }
});

/**
 * GET /api/chat/:userId1/:userId2
 * Історія чату
 */
router.get("/:userId1/:userId2", async (req, res) => {
  try {
    const { userId1, userId2 } = req.params;
    if (!userId1 || !userId2) {
      return res.status(400).json({ message: "Two user ids required" });
    }

    const history = await Message.find({
      $or: [
        { sender: String(userId1), receiver: String(userId2) },
        { sender: String(userId2), receiver: String(userId1) },
      ],
    }).sort({ createdAt: 1 });

    res.json(history);
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
