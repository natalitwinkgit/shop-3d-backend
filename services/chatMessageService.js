import Message from "../models/Message.js";

let chatEmitter = null;

const asPlainMessage = (messageDoc) => {
  const plain =
    typeof messageDoc?.toObject === "function" ? messageDoc.toObject() : { ...(messageDoc || {}) };

  return {
    ...plain,
    sender: String(plain.sender || ""),
    receiver: String(plain.receiver || ""),
    from: String(plain.sender || ""),
    to: String(plain.receiver || ""),
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
  const messageText = String(text || "").trim();

  if (!senderId || !receiverId || !messageText) {
    const err = new Error("sender, receiver and text are required");
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
    source: source === "ai_admin" ? "ai_admin" : "human",
    meta,
  });

  emitChatMessage(doc);
  return doc;
};
