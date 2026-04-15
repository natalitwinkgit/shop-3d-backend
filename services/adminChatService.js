import Message from "../models/Message.js";
import User, { ADMIN_ROLES, isAdminRole } from "../models/userModel.js";
import { getPresenceStatus } from "./userProfileService.js";

export const isObjectIdLike = (value) => /^[a-f0-9]{24}$/i.test(String(value || ""));

export const loadAdminIndex = async () => {
  const admins = await User.find({ role: { $in: ADMIN_ROLES } })
    .select("_id name email role isAiAssistant")
    .lean();

  const adminIds = admins.map((adminUser) => String(adminUser._id));
  const adminSet = new Set(adminIds);
  const adminMap = new Map(
    admins.map((adminUser) => [
      String(adminUser._id),
      {
        _id: String(adminUser._id),
        name: adminUser.name || adminUser.email || "Admin",
        email: adminUser.email || "",
        isAiAssistant: !!adminUser.isAiAssistant,
      },
    ])
  );

  return { admins, adminIds, adminSet, adminMap };
};

export const loadUserNameMap = async (ids) => {
  const objectIds = Array.from(new Set(ids.filter((id) => isObjectIdLike(id))));
  if (!objectIds.length) return new Map();

  const users = await User.find({ _id: { $in: objectIds } })
    .select("_id name email role")
    .lean();

  return new Map(
    users.map((userDoc) => [
      String(userDoc._id),
      {
        _id: String(userDoc._id),
        name: userDoc.name || userDoc.email || "User",
        email: userDoc.email || "",
        role: userDoc.role || "user",
      },
    ])
  );
};

export const getParticipantName = ({ participantId, messageDoc, userMap, adminMap }) => {
  const id = String(participantId || "");

  if (adminMap.has(id)) return adminMap.get(id)?.name || "Admin";

  if (id.startsWith("guest_")) {
    return String(messageDoc?.guestName || "").trim() || "Guest";
  }

  if (userMap.has(id)) {
    const userDoc = userMap.get(id);
    return userDoc?.name || userDoc?.email || "User";
  }

  return "User";
};

const buildAdminAwareHistoryFilter = ({ userId1, userId2, adminIds, adminSet }) => {
  const id1 = String(userId1 || "");
  const id2 = String(userId2 || "");
  const id1IsAdmin = adminSet.has(id1);
  const id2IsAdmin = adminSet.has(id2);

  const externalId =
    id1IsAdmin && !id2IsAdmin ? id2 : !id1IsAdmin && id2IsAdmin ? id1 : null;

  if (externalId) {
    return {
      $or: [
        { sender: externalId, receiver: { $in: adminIds } },
        { receiver: externalId, sender: { $in: adminIds } },
      ],
    };
  }

  return {
    $or: [
      { sender: id1, receiver: id2 },
      { sender: id2, receiver: id1 },
    ],
  };
};

export const getExternalConversationHistory = async (externalUserId) => {
  const { adminIds } = await loadAdminIndex();
  if (!adminIds.length) return [];

  return Message.find({
    $or: [
      { sender: String(externalUserId || ""), receiver: { $in: adminIds } },
      { receiver: String(externalUserId || ""), sender: { $in: adminIds } },
    ],
  })
    .sort({ createdAt: 1 })
    .lean();
};

export const getConversationHistory = async ({ userId1, userId2 }) => {
  const { adminIds, adminSet } = await loadAdminIndex();
  const historyFilter = buildAdminAwareHistoryFilter({
    userId1,
    userId2,
    adminIds,
    adminSet,
  });

  return Message.find(historyFilter).sort({ createdAt: 1 }).lean();
};

export const markConversationRead = async ({ senderId, receiverId }) => {
  const { adminIds, adminSet } = await loadAdminIndex();
  const sender = String(senderId || "");
  const receiver = String(receiverId || "");
  const senderIsAdmin = adminSet.has(sender);
  const receiverIsAdmin = adminSet.has(receiver);

  const filter =
    senderIsAdmin !== receiverIsAdmin
      ? {
          sender: senderIsAdmin ? receiver : sender,
          receiver: { $in: adminIds },
          isRead: false,
        }
      : {
          sender,
          receiver,
          isRead: false,
        };

  return Message.updateMany(filter, { $set: { isRead: true } });
};

export const buildAdminConversationSummaries = async () => {
  const { adminIds, adminSet, adminMap } = await loadAdminIndex();
  if (!adminIds.length) return [];

  const messages = await Message.find({
    $or: [{ sender: { $in: adminIds } }, { receiver: { $in: adminIds } }],
  })
    .sort({ createdAt: -1 })
    .lean();

  const externalIds = new Set();
  const conversationMap = new Map();

  for (const messageDoc of messages) {
    const senderId = String(messageDoc.sender || "");
    const receiverId = String(messageDoc.receiver || "");
    const senderIsAdmin = adminSet.has(senderId);
    const receiverIsAdmin = adminSet.has(receiverId);

    if (senderIsAdmin && receiverIsAdmin) continue;
    if (!senderIsAdmin && !receiverIsAdmin) continue;

    const externalId = senderIsAdmin ? receiverId : senderId;
    externalIds.add(externalId);

    if (!conversationMap.has(externalId)) {
      conversationMap.set(externalId, {
        userId: externalId,
        userName: "",
        name: "",
        lastMessage: String(messageDoc.text || ""),
        lastDate: messageDoc.createdAt,
        unreadCount: 0,
        isGuest: externalId.startsWith("guest_") || !!messageDoc.isGuest,
        answeredByAdminId: null,
        answeredByAdminName: null,
        adminIds: new Set(),
        adminNames: new Set(),
      });
    }

    const conversation = conversationMap.get(externalId);

    if (!senderIsAdmin && !messageDoc.isRead) {
      conversation.unreadCount += 1;
    }

    if (senderIsAdmin) {
      conversation.adminIds.add(senderId);
      const adminName = adminMap.get(senderId)?.name;
      if (adminName) conversation.adminNames.add(adminName);

      if (!conversation.answeredByAdminId) {
        conversation.answeredByAdminId = senderId;
        conversation.answeredByAdminName = adminName || "Admin";
      }
    }

    if (conversation.isGuest && !conversation.userName) {
      conversation.userName = String(messageDoc.guestName || "").trim();
      conversation.name = conversation.userName;
    }
  }

  const userMap = await loadUserNameMap(Array.from(externalIds));

  return Array.from(conversationMap.values())
    .map((conversation) => {
      const fallbackName =
        conversation.isGuest
          ? conversation.userName || "Guest"
          : userMap.get(conversation.userId)?.name ||
            userMap.get(conversation.userId)?.email ||
            "User";

      return {
        userId: conversation.userId,
        userName: fallbackName,
        name: fallbackName,
        lastMessage: conversation.lastMessage,
        lastDate: conversation.lastDate,
        unreadCount: conversation.unreadCount,
        isGuest: conversation.isGuest,
        answeredByAdminId: conversation.answeredByAdminId,
        answeredByAdminName: conversation.answeredByAdminName,
        adminIds: Array.from(conversation.adminIds),
        adminNames: Array.from(conversation.adminNames),
      };
    })
    .sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());
};

export const getSupportAdminProfile = async ({ currentUser } = {}) => {
  const currentAdminId = String(currentUser?._id || currentUser?.id || "");
  if (isAdminRole(currentUser?.role) && currentAdminId) {
    const presence = currentUser?.isAiAssistant ? "online" : getPresenceStatus(currentUser);
    return {
      adminId: currentAdminId,
      adminName: currentUser.name || currentUser.email || "Admin",
      adminEmail: currentUser.email || "",
      isAiAssistant: !!currentUser.isAiAssistant,
      presence,
      isOnline: presence !== "offline",
    };
  }

  const aiEmail = String(process.env.AI_ADMIN_EMAIL || "").trim();
  const supportEmail = String(process.env.SUPPORT_ADMIN_EMAIL || "").trim();

  const candidates = [];
  if (aiEmail) candidates.push({ email: aiEmail, role: { $in: ADMIN_ROLES } });
  candidates.push({ role: { $in: ADMIN_ROLES }, isAiAssistant: true });
  if (supportEmail) candidates.push({ email: supportEmail, role: { $in: ADMIN_ROLES } });
  candidates.push({ role: { $in: ADMIN_ROLES } });

  for (const query of candidates) {
    const adminUser = await User.findOne(query)
      .select("_id name email isAiAssistant isOnline presence lastActivityAt lastHeartbeatAt lastSeen")
      .lean();
    if (adminUser) {
      const presence = adminUser.isAiAssistant ? "online" : getPresenceStatus(adminUser);
      return {
        adminId: String(adminUser._id),
        adminName: adminUser.name || adminUser.email || "Admin",
        adminEmail: adminUser.email || "",
        isAiAssistant: !!adminUser.isAiAssistant,
        presence,
        isOnline: presence !== "offline",
      };
    }
  }

  return null;
};
