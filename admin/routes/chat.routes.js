import { Router } from "express";
import { z } from "zod";

import { validateZodBody } from "../../app/middleware/validateZod.js";
import User, { ADMIN_ROLES } from "../../models/userModel.js";
import {
  buildAdminConversationSummaries,
  getConversationHistoryPayload,
  getConversationPeerForViewer,
  markConversationDelivered,
  markConversationRead,
  processDirectChatMessage,
} from "../../services/adminChatService.js";
import { getPresenceStatus } from "../../services/userProfileService.js";

const router = Router();
const DIRECT_MESSAGE_MAX_LENGTH = 3000;

const directMessageSchema = z.object({
  senderId: z.string().trim().min(1, "senderId is required"),
  receiverId: z.string().trim().min(1, "receiverId is required"),
  conversationId: z.string().trim().optional(),
  text: z.string().trim().min(1, "text is required").max(DIRECT_MESSAGE_MAX_LENGTH),
  language: z.string().trim().optional(),
  mode: z.enum(["live", "text"]).optional(),
});

const getChatConversations = async (_req, res) => {
  try {
    const conversations = await buildAdminConversationSummaries();
    res.json(conversations);
  } catch (error) {
    console.error("[ADMIN chat conversations]", error);
    res.status(500).json({ message: "Failed to load conversations" });
  }
};

const getSupportAdmin = async (req, res) => {
  try {
    const currentAdminId = String(req.user?._id || req.user?.id || "");
    if (currentAdminId) {
      const presence = req.user?.isAiAssistant ? "online" : getPresenceStatus(req.user);
      return res.json({
        adminId: currentAdminId,
        adminName: req.user?.name || req.user?.email || "Admin",
        adminEmail: req.user?.email || "",
        isAiAssistant: !!req.user?.isAiAssistant,
        presence,
        isOnline: presence !== "offline",
      });
    }

    const firstAdmin = await User.findOne({ role: { $in: ADMIN_ROLES } })
      .select("_id name email isAiAssistant isOnline presence lastActivityAt lastHeartbeatAt lastSeen")
      .lean();
    if (!firstAdmin) return res.status(404).json({ message: "No admin found" });
    const presence = firstAdmin.isAiAssistant ? "online" : getPresenceStatus(firstAdmin);

    return res.json({
      adminId: String(firstAdmin._id),
      adminName: firstAdmin.name || firstAdmin.email || "Admin",
      adminEmail: firstAdmin.email || "",
      isAiAssistant: !!firstAdmin.isAiAssistant,
      presence,
      isOnline: presence !== "offline",
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to get admin id" });
  }
};

router.get("/chat-conversations", getChatConversations);
router.get("/chat/conversations", getChatConversations);
router.get("/chat/support-admin", getSupportAdmin);
router.get("/chat/admin-id", getSupportAdmin);
router.post("/chat/direct-message", validateZodBody(directMessageSchema), async (req, res) => {
  try {
    const result = await processDirectChatMessage(req.body || {});
    res.status(201).json(result);
  } catch (error) {
    res.status(error?.statusCode || 500).json({
      message: error?.message || "Failed to send direct message",
    });
  }
});

router.patch("/chat/read/:senderId/:receiverId", async (req, res) => {
  try {
    await markConversationRead({
      senderId: req.params.senderId,
      receiverId: req.params.receiverId,
    });

    res.status(204).end();
  } catch (error) {
    res.status(500).json({ message: "Failed to mark read" });
  }
});

router.get("/chat/:userId1/:userId2", async (req, res) => {
  try {
    const userId1 = String(req.params.userId1 || "");
    const userId2 = String(req.params.userId2 || "");
    const viewerId = String(req.user?._id || req.user?.id || "").trim();
    const peerId = await getConversationPeerForViewer({ userId1, userId2, viewerId });
    if (viewerId && peerId) {
      await markConversationDelivered({ senderId: peerId, receiverId: viewerId });
    }

    res.json(await getConversationHistoryPayload({ userId1, userId2 }));
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
