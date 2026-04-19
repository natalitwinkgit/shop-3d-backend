import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import Message from "../models/Message.js";
import User from "../models/userModel.js";
import {
  buildAdminConversationSummaries,
  getConversationHistoryPayload,
  markConversationRead,
  processDirectChatMessage,
} from "../services/adminChatService.js";

const objectId = () => new mongoose.Types.ObjectId();

test("admin chat summaries include unread count, presence, and last message delivery status", async () => {
  const adminId = objectId();
  const userId = objectId();
  const originalUserFind = User.find;
  const originalMessageFind = Message.find;

  User.find = (query) => ({
    select() {
      return this;
    },
    lean() {
      if (query?.role?.$in) {
        return Promise.resolve([
          { _id: adminId, name: "Admin", email: "admin@example.com", role: "admin" },
        ]);
      }

      return Promise.resolve([
        {
          _id: userId,
          name: "Ivan",
          email: "ivan@example.com",
          role: "user",
          isOnline: true,
          presence: "online",
          lastActivityAt: new Date(),
          lastHeartbeatAt: new Date(),
          lastSeen: new Date("2026-04-19T20:00:00.000Z"),
        },
      ]);
    },
  });

  Message.find = () => ({
    sort() {
      return this;
    },
    lean() {
      return Promise.resolve([
        {
          _id: objectId(),
          sender: String(adminId),
          receiver: String(userId),
          text: "Відповідь менеджера",
          isRead: false,
          deliveredAt: new Date("2026-04-19T20:05:00.000Z"),
          readAt: null,
          createdAt: new Date("2026-04-19T20:05:00.000Z"),
        },
        {
          _id: objectId(),
          sender: String(userId),
          receiver: String(adminId),
          text: "Потрібна консультація",
          isRead: false,
          deliveredAt: null,
          readAt: null,
          createdAt: new Date("2026-04-19T20:01:00.000Z"),
        },
      ]);
    },
  });

  try {
    const conversations = await buildAdminConversationSummaries();

    assert.equal(conversations.length, 1);
    assert.equal(conversations[0].userId, String(userId));
    assert.equal(conversations[0].unreadCount, 1);
    assert.equal(conversations[0].presence, "online");
    assert.equal(conversations[0].isOnline, true);
    assert.equal(conversations[0].lastMessage, "Відповідь менеджера");
    assert.equal(conversations[0].lastMessageDeliveryStatus, "delivered");
  } finally {
    User.find = originalUserFind;
    Message.find = originalMessageFind;
  }
});

test("conversation history payload exposes delivery status and participant names", async () => {
  const adminId = objectId();
  const userId = objectId();
  const originalUserFind = User.find;
  const originalMessageFind = Message.find;

  User.find = (query) => ({
    select() {
      return this;
    },
    lean() {
      if (query?.role?.$in) {
        return Promise.resolve([
          { _id: adminId, name: "Admin", email: "admin@example.com", role: "admin" },
        ]);
      }

      return Promise.resolve([
        {
          _id: userId,
          name: "Ivan",
          email: "ivan@example.com",
          role: "user",
          isOnline: false,
          presence: "offline",
          lastSeen: new Date("2026-04-19T19:00:00.000Z"),
        },
      ]);
    },
  });

  Message.find = () => ({
    sort() {
      return this;
    },
    lean() {
      return Promise.resolve([
        {
          _id: objectId(),
          sender: String(userId),
          receiver: String(adminId),
          text: "Добрий день",
          isRead: true,
          deliveredAt: new Date("2026-04-19T20:00:00.000Z"),
          readAt: new Date("2026-04-19T20:01:00.000Z"),
          createdAt: new Date("2026-04-19T20:00:00.000Z"),
        },
      ]);
    },
  });

  try {
    const history = await getConversationHistoryPayload({
      userId1: String(adminId),
      userId2: String(userId),
    });

    assert.equal(history.length, 1);
    assert.equal(history[0].senderName, "Ivan");
    assert.equal(history[0].receiverName, "Admin");
    assert.equal(history[0].deliveryStatus, "read");
    assert.equal(history[0].senderIsAdmin, false);
    assert.equal(history[0].receiverIsAdmin, true);
  } finally {
    User.find = originalUserFind;
    Message.find = originalMessageFind;
  }
});

test("markConversationRead stores read and delivered timestamps for admin-aware chats", async () => {
  const adminId = objectId();
  const userId = objectId();
  const messageId = objectId();
  const originalUserFind = User.find;
  const originalMessageFind = Message.find;
  const originalBulkWrite = Message.bulkWrite;
  const bulkOps = [];

  User.find = (query) => ({
    select() {
      return this;
    },
    lean() {
      if (query?.role?.$in) {
        return Promise.resolve([
          { _id: adminId, name: "Admin", email: "admin@example.com", role: "admin" },
        ]);
      }
      return Promise.resolve([]);
    },
  });

  Message.find = () => ({
    lean() {
      return Promise.resolve([
        {
          _id: messageId,
          sender: String(userId),
          receiver: String(adminId),
          text: "Нове повідомлення",
          isRead: false,
          deliveredAt: null,
          readAt: null,
        },
      ]);
    },
  });

  Message.bulkWrite = async (ops) => {
    bulkOps.push(...ops);
    return { ok: 1 };
  };

  try {
    const updated = await markConversationRead({
      senderId: String(userId),
      receiverId: String(adminId),
    });

    assert.equal(updated.length, 1);
    assert.equal(updated[0].isRead, true);
    assert.ok(updated[0].deliveredAt instanceof Date);
    assert.ok(updated[0].readAt instanceof Date);
    assert.equal(bulkOps.length, 1);
    assert.equal(String(bulkOps[0].updateOne.filter._id), String(messageId));
    assert.equal(bulkOps[0].updateOne.update.$set.isRead, true);
  } finally {
    User.find = originalUserFind;
    Message.find = originalMessageFind;
    Message.bulkWrite = originalBulkWrite;
  }
});

test("processDirectChatMessage persists admin direct messages with metadata", async () => {
  const adminId = objectId();
  const userId = objectId();
  const messageId = objectId();
  const createdAt = new Date("2026-04-20T09:00:00.000Z");
  const originalUserFind = User.find;
  const originalMessageCreate = Message.create;

  User.find = (query) => ({
    select() {
      return this;
    },
    lean() {
      if (query?.role?.$in) {
        return Promise.resolve([
          { _id: adminId, name: "Support Admin", email: "admin@example.com", role: "admin" },
        ]);
      }

      return Promise.resolve([
        {
          _id: userId,
          name: "Customer",
          email: "customer@example.com",
          role: "user",
          isOnline: false,
          presence: "offline",
          lastSeen: null,
        },
      ]);
    },
  });

  Message.create = async (payload) => ({
    _id: messageId,
    ...payload,
    isRead: false,
    deliveredAt: null,
    readAt: null,
    createdAt,
    updatedAt: createdAt,
    toObject() {
      return {
        _id: messageId,
        ...payload,
        isRead: false,
        deliveredAt: null,
        readAt: null,
        createdAt,
        updatedAt: createdAt,
      };
    },
  });

  try {
    const result = await processDirectChatMessage({
      senderId: String(adminId),
      receiverId: String(userId),
      conversationId: "conv-42",
      text: "Тестове повідомлення",
      language: "uk-UA",
      mode: "text",
    });

    assert.equal(result.conversationId, "conv-42");
    assert.equal(result.mode, "text");
    assert.equal(result.language, "uk-UA");
    assert.equal(result.message.sender, String(adminId));
    assert.equal(result.message.receiver, String(userId));
    assert.equal(result.message.text, "Тестове повідомлення");
    assert.equal(result.message.senderName, "Support Admin");
    assert.equal(result.message.receiverName, "Customer");
    assert.equal(result.message.meta.conversationId, "conv-42");
    assert.equal(result.message.meta.language, "uk-UA");
    assert.equal(result.message.meta.mode, "text");
  } finally {
    User.find = originalUserFind;
    Message.create = originalMessageCreate;
  }
});
