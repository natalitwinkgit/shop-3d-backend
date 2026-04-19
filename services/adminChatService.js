import Message from "../models/Message.js";
import User, { ADMIN_ROLES, isAdminRole } from "../models/userModel.js";
import { createChatMessage } from "./chatMessageService.js";
import { emitChatMessageStatus, getMessageDeliveryStatus } from "./chatMessageService.js";
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
    .select("_id name email role isOnline presence lastActivityAt lastHeartbeatAt lastSeen")
    .lean();

  return new Map(
    users.map((userDoc) => [
      String(userDoc._id),
      {
        _id: String(userDoc._id),
        name: userDoc.name || userDoc.email || "User",
        email: userDoc.email || "",
        role: userDoc.role || "user",
        presence: getPresenceStatus(userDoc),
        isOnline: getPresenceStatus(userDoc) !== "offline",
        lastSeen: userDoc.lastSeen || null,
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

const buildAdminAwareStatusFilter = ({ senderId, receiverId, adminIds, adminSet }) => {
  const sender = String(senderId || "");
  const receiver = String(receiverId || "");
  const senderIsAdmin = adminSet.has(sender);
  const receiverIsAdmin = adminSet.has(receiver);

  if (senderIsAdmin !== receiverIsAdmin) {
    return {
      sender: senderIsAdmin ? receiver : sender,
      receiver: { $in: adminIds },
    };
  }

  return {
    sender,
    receiver,
  };
};

const applyMessageStatusUpdates = async (docs = [], buildPatch) => {
  const safeDocs = Array.isArray(docs) ? docs : [];
  if (!safeDocs.length) return [];

  const ops = [];
  const updatedDocs = [];

  for (const doc of safeDocs) {
    const patch = buildPatch(doc);
    const set = patch?.$set || {};
    if (!Object.keys(set).length) continue;
    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: patch,
      },
    });
    updatedDocs.push({ ...doc, ...set });
  }

  if (!ops.length) return [];
  await Message.bulkWrite(ops);
  updatedDocs.forEach((doc) => emitChatMessageStatus(doc));
  return updatedDocs;
};

export const serializeConversationMessage = ({
  messageDoc,
  adminSet = new Set(),
  adminMap = new Map(),
  userMap = new Map(),
} = {}) => {
  const senderId = String(messageDoc?.sender || "");
  const receiverId = String(messageDoc?.receiver || "");
  const senderIsAdmin = adminSet.has(senderId);
  const receiverIsAdmin = adminSet.has(receiverId);

  return {
    ...messageDoc,
    sender: senderId,
    receiver: receiverId,
    from: senderId,
    to: receiverId,
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
    deliveredAt: messageDoc?.deliveredAt || null,
    readAt: messageDoc?.readAt || null,
    deliveryStatus: getMessageDeliveryStatus(messageDoc),
    status: getMessageDeliveryStatus(messageDoc),
    repliedByAdminId: senderIsAdmin ? senderId : null,
    repliedByAdminName: senderIsAdmin ? adminMap.get(senderId)?.name || "Admin" : null,
  };
};

export const getConversationPeerForViewer = async ({ userId1, userId2, viewerId }) => {
  const viewer = String(viewerId || "");
  const first = String(userId1 || "");
  const second = String(userId2 || "");
  const { adminSet } = await loadAdminIndex();

  if (viewer && viewer === first) return second;
  if (viewer && viewer === second) return first;

  const firstIsAdmin = adminSet.has(first);
  const secondIsAdmin = adminSet.has(second);
  if (firstIsAdmin && !secondIsAdmin) return second;
  if (!firstIsAdmin && secondIsAdmin) return first;

  return second || first;
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

export const getConversationHistoryPayload = async ({ userId1, userId2 }) => {
  const { adminIds, adminSet, adminMap } = await loadAdminIndex();
  const historyFilter = buildAdminAwareHistoryFilter({
    userId1,
    userId2,
    adminIds,
    adminSet,
  });

  const history = await Message.find(historyFilter).sort({ createdAt: 1 }).lean();
  const participantIds = new Set();
  for (const messageDoc of history) {
    participantIds.add(String(messageDoc.sender || ""));
    participantIds.add(String(messageDoc.receiver || ""));
  }
  const userMap = await loadUserNameMap(Array.from(participantIds));

  return history.map((messageDoc) =>
    serializeConversationMessage({
      messageDoc,
      adminSet,
      adminMap,
      userMap,
    })
  );
};

export const processDirectChatMessage = async ({
  senderId,
  receiverId,
  conversationId = "",
  text,
  language = "",
  mode = "text",
} = {}) => {
  const safeSenderId = String(senderId || "").trim();
  const safeReceiverId = String(receiverId || "").trim();
  const safeConversationId = String(conversationId || "").trim();
  const safeLanguage = String(language || "").trim();
  const safeMode = String(mode || "text").trim() || "text";

  const messageDoc = await createChatMessage({
    sender: safeSenderId,
    receiver: safeReceiverId,
    text,
    source: "human",
    meta: {
      type: safeMode === "live" ? "voice" : "text",
      mode: safeMode,
      status: "final",
      ...(safeConversationId ? { conversationId: safeConversationId } : {}),
      ...(safeLanguage ? { language: safeLanguage } : {}),
    },
  });

  const plainMessage =
    typeof messageDoc?.toObject === "function" ? messageDoc.toObject() : { ...(messageDoc || {}) };
  const { adminSet, adminMap } = await loadAdminIndex();
  const userMap = await loadUserNameMap([safeSenderId, safeReceiverId]);

  return {
    conversationId: safeConversationId || [safeSenderId, safeReceiverId].sort().join(":"),
    mode: safeMode,
    language: safeLanguage || null,
    message: serializeConversationMessage({
      messageDoc: plainMessage,
      adminSet,
      adminMap,
      userMap,
    }),
  };
};

export const markConversationDelivered = async ({ senderId, receiverId }) => {
  const { adminIds, adminSet } = await loadAdminIndex();
  const baseFilter = buildAdminAwareStatusFilter({
    senderId,
    receiverId,
    adminIds,
    adminSet,
  });
  const docs = await Message.find({
    ...baseFilter,
    deliveredAt: null,
  }).lean();

  return applyMessageStatusUpdates(docs, () => ({
    $set: {
      deliveredAt: new Date(),
    },
  }));
};

export const markMessagesDeliveredForReceiver = async ({ receiverId }) => {
  const safeReceiverId = String(receiverId || "");
  if (!safeReceiverId) return [];

  const docs = await Message.find({
    receiver: safeReceiverId,
    deliveredAt: null,
  }).lean();

  return applyMessageStatusUpdates(docs, () => ({
    $set: {
      deliveredAt: new Date(),
    },
  }));
};

export const markConversationRead = async ({ senderId, receiverId }) => {
  const { adminIds, adminSet } = await loadAdminIndex();
  const baseFilter = buildAdminAwareStatusFilter({
    senderId,
    receiverId,
    adminIds,
    adminSet,
  });
  const docs = await Message.find({
    ...baseFilter,
    isRead: false,
  }).lean();

  return applyMessageStatusUpdates(docs, (doc) => ({
    $set: {
      isRead: true,
      deliveredAt: doc?.deliveredAt || new Date(),
      readAt: doc?.readAt || new Date(),
    },
  }));
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
        lastMessageId: String(messageDoc._id || ""),
        lastMessageSender: senderId,
        lastMessageReceiver: receiverId,
        lastMessage: String(messageDoc.text || ""),
        lastDate: messageDoc.createdAt,
        lastMessageDeliveryStatus: getMessageDeliveryStatus(messageDoc),
        lastMessageDeliveredAt: messageDoc.deliveredAt || null,
        lastMessageReadAt: messageDoc.readAt || null,
        unreadCount: 0,
        isGuest: externalId.startsWith("guest_") || !!messageDoc.isGuest,
        answeredByAdminId: null,
        answeredByAdminName: null,
        adminIds: new Set(),
        adminNames: new Set(),
        presence: "offline",
        isOnline: false,
        lastSeen: null,
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
      const userMeta = userMap.get(conversation.userId) || null;

      return {
        userId: conversation.userId,
        userName: fallbackName,
        name: fallbackName,
        lastMessageId: conversation.lastMessageId,
        lastMessageSender: conversation.lastMessageSender,
        lastMessageReceiver: conversation.lastMessageReceiver,
        lastMessage: conversation.lastMessage,
        lastDate: conversation.lastDate,
        lastMessageDeliveryStatus: conversation.lastMessageDeliveryStatus,
        lastMessageDeliveredAt: conversation.lastMessageDeliveredAt,
        lastMessageReadAt: conversation.lastMessageReadAt,
        unreadCount: conversation.unreadCount,
        isGuest: conversation.isGuest,
        answeredByAdminId: conversation.answeredByAdminId,
        answeredByAdminName: conversation.answeredByAdminName,
        adminIds: Array.from(conversation.adminIds),
        adminNames: Array.from(conversation.adminNames),
        presence: conversation.isGuest ? "offline" : userMeta?.presence || "offline",
        isOnline: conversation.isGuest ? false : !!userMeta?.isOnline,
        lastSeen: conversation.isGuest ? null : userMeta?.lastSeen || null,
      };
    })
    .sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());
};

export const countChatConversations = async () => {
  const conversations = await buildAdminConversationSummaries();
  return conversations.length;
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
