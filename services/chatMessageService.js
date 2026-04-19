import Message from "../models/Message.js";
import { sanitizeInputForSecurity } from "../app/middleware/inputSecurity.js";

let chatEmitter = null;
const CHAT_MESSAGE_MAX_LENGTH = 3000;
const activeChatParticipants = new Map();

const pickStr = (value) => String(value || "").trim();

export const getMessageDeliveryStatus = (messageDoc = {}) => {
  if (messageDoc?.readAt || messageDoc?.isRead) return "read";
  if (messageDoc?.deliveredAt) return "delivered";
  return "sent";
};

const asPlainMessage = (messageDoc) => {
  const plain =
    typeof messageDoc?.toObject === "function" ? messageDoc.toObject() : { ...(messageDoc || {}) };

  return {
    ...plain,
    sender: pickStr(plain.sender),
    receiver: pickStr(plain.receiver),
    from: pickStr(plain.sender),
    to: pickStr(plain.receiver),
    deliveredAt: plain.deliveredAt || null,
    readAt: plain.readAt || null,
    deliveryStatus: getMessageDeliveryStatus(plain),
    status: getMessageDeliveryStatus(plain),
  };
};

export const registerChatEmitter = (io) => {
  chatEmitter = io || null;
};

export const emitChatMessage = (messageDoc) => {
  const payload = asPlainMessage(messageDoc);
  if (!chatEmitter) return payload;

  const rooms = Array.from(new Set([payload.sender, payload.receiver].filter(Boolean)));
  for (const room of rooms) {
    chatEmitter.to(room).emit("message:new", payload);
    chatEmitter.to(room).emit("receive_message", payload);
  }

  return payload;
};

export const emitChatMessageStatus = (messageDoc) => {
  const payload = asPlainMessage(messageDoc);
  const statusPayload = {
    _id: payload._id,
    id: payload._id,
    messageId: payload._id,
    sender: payload.sender,
    receiver: payload.receiver,
    deliveryStatus: payload.deliveryStatus,
    status: payload.deliveryStatus,
    deliveredAt: payload.deliveredAt || null,
    readAt: payload.readAt || null,
    isRead: !!payload.isRead,
    updatedAt: payload.updatedAt || payload.readAt || payload.deliveredAt || new Date().toISOString(),
  };

  if (!chatEmitter) return statusPayload;

  const rooms = Array.from(new Set([payload.sender, payload.receiver].filter(Boolean)));
  for (const room of rooms) {
    chatEmitter.to(room).emit("message:status", statusPayload);
    chatEmitter.to(room).emit("message_status", statusPayload);
  }

  return statusPayload;
};

export const markChatParticipantConnected = (participantId) => {
  const safeId = pickStr(participantId);
  if (!safeId) return 0;
  const nextCount = (activeChatParticipants.get(safeId) || 0) + 1;
  activeChatParticipants.set(safeId, nextCount);
  return nextCount;
};

export const markChatParticipantDisconnected = (participantId) => {
  const safeId = pickStr(participantId);
  if (!safeId) return 0;
  const currentCount = activeChatParticipants.get(safeId) || 0;
  if (currentCount <= 1) {
    activeChatParticipants.delete(safeId);
    return 0;
  }
  const nextCount = currentCount - 1;
  activeChatParticipants.set(safeId, nextCount);
  return nextCount;
};

export const isChatParticipantConnected = (participantId) =>
  (activeChatParticipants.get(pickStr(participantId)) || 0) > 0;

export const emitChatLiveStatus = ({
  participants = [],
  conversationId = "",
  state = "idle",
  mode = "live",
  meta = null,
} = {}) => {
  if (!chatEmitter) return;

  const payload = {
    conversationId: String(conversationId || ""),
    state: String(state || "idle"),
    mode: String(mode || "live"),
    meta: meta || null,
    at: new Date().toISOString(),
  };

  const rooms = Array.from(new Set((participants || []).map((id) => String(id || "").trim()).filter(Boolean)));
  for (const room of rooms) {
    chatEmitter.to(room).emit("chat:live:status", payload);
  }
};

export const createChatMessage = async ({
  sender,
  receiver,
  text,
  isGuest = false,
  guestName = "",
  source = "human",
  meta = null,
}) => {
  const senderId = String(sender || "").trim();
  const receiverId = String(receiver || "").trim();
  const messageText = String(sanitizeInputForSecurity(text) || "").trim();

  if (!senderId || !receiverId || !messageText) {
    const err = new Error("sender, receiver and text are required");
    err.statusCode = 400;
    throw err;
  }

  if (messageText.length > CHAT_MESSAGE_MAX_LENGTH) {
    const err = new Error(`text must contain at most ${CHAT_MESSAGE_MAX_LENGTH} characters`);
    err.statusCode = 400;
    throw err;
  }

  const doc = await Message.create({
    sender: senderId,
    receiver: receiverId,
    text: messageText,
    isGuest: !!isGuest,
    guestName: String(guestName || "").trim(),
    isRead: false,
    deliveredAt: isChatParticipantConnected(receiverId) ? new Date() : null,
    readAt: null,
    source: source === "ai_admin" ? "ai_admin" : "human",
    meta,
  });

  emitChatMessage(doc);
  return doc;
};
