import { Router } from "express";

import Message from "../../models/Message.js";
import User, { ADMIN_ROLES } from "../../models/userModel.js";
import {
  buildAdminConversationSummaries,
  getParticipantName,
  loadAdminIndex,
  loadUserNameMap,
} from "../lib/adminShared.js";
import { getPresenceStatus } from "../../services/userProfileService.js";

const router = Router();

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

router.patch("/chat/read/:senderId/:receiverId", async (req, res) => {
  try {
    const { adminIds, adminSet } = await loadAdminIndex();
    const senderId = String(req.params.senderId || "");
    const receiverId = String(req.params.receiverId || "");

    const senderIsAdmin = adminSet.has(senderId);
    const receiverIsAdmin = adminSet.has(receiverId);

    const filter =
      senderIsAdmin !== receiverIsAdmin
        ? {
            sender: senderIsAdmin ? receiverId : senderId,
            receiver: { $in: adminIds },
            isRead: false,
          }
        : {
            sender: senderId,
            receiver: receiverId,
            isRead: false,
          };

    await Message.updateMany(filter, { $set: { isRead: true } });

    res.status(204).end();
  } catch (error) {
    res.status(500).json({ message: "Failed to mark read" });
  }
});

router.get("/chat/:userId1/:userId2", async (req, res) => {
  try {
    const { adminIds, adminSet, adminMap } = await loadAdminIndex();
    const userId1 = String(req.params.userId1 || "");
    const userId2 = String(req.params.userId2 || "");

    const id1IsAdmin = adminSet.has(userId1);
    const id2IsAdmin = adminSet.has(userId2);

    const externalId =
      id1IsAdmin && !id2IsAdmin
        ? userId2
        : !id1IsAdmin && id2IsAdmin
          ? userId1
          : null;

    const historyFilter = externalId
      ? {
          $or: [
            { sender: externalId, receiver: { $in: adminIds } },
            { receiver: externalId, sender: { $in: adminIds } },
          ],
        }
      : {
          $or: [
            { sender: userId1, receiver: userId2 },
            { sender: userId2, receiver: userId1 },
          ],
        };

    const history = await Message.find(historyFilter).sort({ createdAt: 1 }).lean();

    const participantIds = new Set();
    for (const messageDoc of history) {
      participantIds.add(String(messageDoc.sender || ""));
      participantIds.add(String(messageDoc.receiver || ""));
    }

    const userMap = await loadUserNameMap(Array.from(participantIds));

    const payload = history.map((messageDoc) => {
      const senderId = String(messageDoc.sender || "");
      const receiverId = String(messageDoc.receiver || "");
      const senderIsAdmin = adminSet.has(senderId);
      const receiverIsAdmin = adminSet.has(receiverId);

      return {
        ...messageDoc,
        sender: senderId,
        receiver: receiverId,
        senderIsAdmin,
        receiverIsAdmin,
        senderName: getParticipantName({
          participantId: senderId,
          messageDoc,
          userMap,
          adminMap,
        }),
        receiverName: getParticipantName({
          participantId: receiverId,
          messageDoc,
          userMap,
          adminMap,
        }),
        repliedByAdminId: senderIsAdmin ? senderId : null,
        repliedByAdminName: senderIsAdmin ? adminMap.get(senderId)?.name || "Admin" : null,
      };
    });

    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
