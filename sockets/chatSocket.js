import { Server } from "socket.io";

import { socketCorsOptions } from "../config/cors.js";
import { loadAdminIndex } from "../services/adminChatService.js";
import { createChatMessage, registerChatEmitter } from "../services/chatMessageService.js";
import {
  extractSocketAccessToken,
  resolveChatSessionFromToken,
} from "../services/chatSessionService.js";

const pickStr = (value) => String(value || "").trim();

export const createSocketServer = (server) => {
  const io = new Server(server, {
    cors: socketCorsOptions,
  });

  registerChatEmitter(io);

  io.use(async (socket, next) => {
    try {
      const token = extractSocketAccessToken(socket);
      const session = await resolveChatSessionFromToken(token);
      socket.data.chatSession = session;
      return next();
    } catch (error) {
      return next(new Error(error.message || "CHAT_AUTH_FAILED"));
    }
  });

  io.on("connection", (socket) => {
    const session = socket.data.chatSession || {};
    const sessionId = pickStr(session.id);

    const joinOwnRoom = () => {
      if (sessionId) {
        socket.join(sessionId);
      }
    };

    joinOwnRoom();

    const handleSendMessage = async (payload) => {
      try {
        const sender = pickStr(
          payload?.sender ??
            payload?.from ??
            payload?.senderId ??
            ""
        );
        const receiver = pickStr(
          payload?.receiver ??
            payload?.to ??
            payload?.receiverId ??
            payload?.chatUserId ??
            ""
        );
        const text = pickStr(payload?.text ?? payload?.message ?? "");

        if (!receiver || !text) {
          console.warn("[socket message:send] skipped invalid payload", {
            hasReceiver: !!receiver,
            hasText: !!text,
          });
          return;
        }

        const senderId = sender || sessionId;
        if (!senderId || senderId !== sessionId) {
          console.warn("[socket message:send] sender mismatch", {
            sessionId,
            senderId,
          });
          return;
        }

        if (!session.isAdmin) {
          const { adminSet } = await loadAdminIndex();
          if (!adminSet.has(receiver)) {
            console.warn("[socket message:send] blocked non-admin target", {
              senderId,
              receiver,
            });
            return;
          }
        }

        joinOwnRoom();

        const guestName = session.kind === "guest" ? pickStr(session.guestName) : "";

        await createChatMessage({
          sender: senderId,
          receiver,
          text,
          isGuest: session.kind === "guest",
          guestName,
        });
      } catch (error) {
        console.error("[socket message:send] error:", error);
      }
    };

    socket.on("join", () => {
      joinOwnRoom();
    });
    socket.on("join_chat", () => {
      joinOwnRoom();
    });
    socket.on("chat:live:join", () => {
      joinOwnRoom();
    });
    socket.on("message:send", async (payload) => {
      await handleSendMessage(payload);
    });
    socket.on("send_message", async (payload) => {
      await handleSendMessage(payload);
    });
    socket.on("disconnect", () => {});
  });

  return io;
};
