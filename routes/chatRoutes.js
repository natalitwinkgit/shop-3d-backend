// server/routes/chatRoutes.js
import express from "express";
import multer from "multer";
import { createRateLimit } from "../middleware/rateLimitMiddleware.js";
import { protect } from "../middleware/authMiddleware.js";
import { validateZodBody } from "../app/middleware/validateZod.js";
import { z } from "zod";
import { canAccessSupportConversation } from "../services/chatAccessService.js";
import {
  getConversationHistory,
  getSupportAdminProfile,
  markConversationRead,
} from "../services/adminChatService.js";
import { createGuestChatSession } from "../services/chatSessionService.js";
import { handleLiveVoiceTurn, handleTextChatTurn } from "../controllers/liveVoiceController.js";

const router = express.Router();
const pickStr = (value) => String(value || "").trim();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

const guestSessionRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many guest chat session requests. Please try again later.",
});
const liveVoiceRateLimit = createRateLimit({
  windowMs: 60 * 1000,
  max: 25,
  message: "Too many live voice turns. Please slow down.",
  keyGenerator: (req) => {
    const userId = pickStr(req.user?._id || req.user?.id);
    const conversationId = pickStr(req.body?.conversationId);
    return ["live", userId, conversationId].filter(Boolean).join(":");
  },
});
const textTurnRateLimit = createRateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many text chat turns. Please slow down.",
  keyGenerator: (req) => {
    const userId = pickStr(req.user?._id || req.user?.id);
    const conversationId = pickStr(req.body?.conversationId);
    return ["text", userId, conversationId].filter(Boolean).join(":");
  },
});

const resolveChatTurnRateLimit = (req) => {
  const requestedMode = pickStr(req.body?.mode).toLowerCase();
  if (requestedMode === "text") return textTurnRateLimit;
  if (requestedMode === "live") return liveVoiceRateLimit;

  const hasAudio = Boolean(req.file?.buffer?.length);
  if (hasAudio) return liveVoiceRateLimit;

  const hasTypedText = Boolean(pickStr(req.body?.text || req.body?.transcript));
  return hasTypedText ? textTurnRateLimit : liveVoiceRateLimit;
};

const applyChatTurnRateLimit = (req, res, next) => {
  // Distinguish typed turns from voice turns after multer has parsed the payload.
  // Otherwise text messages can be counted against the tighter live-voice quota.
  const limiter = resolveChatTurnRateLimit(req);
  return limiter(req, res, next);
};

const chatTurnBodySchema = z.object({
  text: z.string().trim().optional(),
  transcript: z.string().trim().optional(),
  language: z.string().trim().optional(),
  mode: z.enum(["live", "text"]).optional(),
  senderId: z.string().trim().optional(),
  receiverId: z.string().trim().optional(),
  conversationId: z.string().trim().optional(),
});

router.post("/guest-session", guestSessionRateLimit, async (req, res) => {
  try {
    const session = await createGuestChatSession({
      guestName: req.body?.guestName || "",
    });
    res.status(201).json(session);
  } catch (e) {
    res.status(e.statusCode || 500).json({
      message: e.message || "Failed to create guest session",
    });
  }
});

router.post(
  "/live/turn",
  protect,
  upload.single("audio"),
  applyChatTurnRateLimit,
  validateZodBody(chatTurnBodySchema),
  handleLiveVoiceTurn
);

router.post(
  "/text/turn",
  protect,
  upload.single("audio"),
  applyChatTurnRateLimit,
  validateZodBody(chatTurnBodySchema),
  handleTextChatTurn
);

router.get("/admin-id", protect, async (req, res) => {
  try {
    const adminProfile = await getSupportAdminProfile({ currentUser: req.user });
    if (!adminProfile) return res.status(404).json({ message: "No admin found" });
    res.json({
      adminId: adminProfile.adminId,
      adminName: adminProfile.adminName || "Admin",
      adminEmail: adminProfile.adminEmail || "",
      presence: adminProfile.presence || "offline",
      isOnline: !!adminProfile.isOnline,
      isAiAssistant: !!adminProfile.isAiAssistant,
    });
  } catch (e) {
    res.status(500).json({ message: "Failed to get admin id" });
  }
});

router.get("/support-admin", protect, async (req, res) => {
  try {
    const adminProfile = await getSupportAdminProfile({ currentUser: req.user });
    if (!adminProfile) return res.status(404).json({ message: "No admin found" });
    res.json({
      adminId: adminProfile.adminId,
      adminName: adminProfile.adminName || "Admin",
      adminEmail: adminProfile.adminEmail || "",
      isAiAssistant: !!adminProfile.isAiAssistant,
      presence: adminProfile.presence || "offline",
      isOnline: !!adminProfile.isOnline,
    });
  } catch (e) {
    res.status(500).json({ message: "Failed to get admin id" });
  }
});

/**
 * PATCH /api/chat/read/:senderId/:receiverId
 * Позначити повідомлення як прочитані: sender -> receiver
 */
router.patch("/read/:senderId/:receiverId", protect, async (req, res) => {
  try {
    const { senderId, receiverId } = req.params;

    if (!senderId || !receiverId) {
      return res.status(400).json({ message: "senderId and receiverId required" });
    }

    if (
      !(await canAccessSupportConversation({
        currentUser: req.user,
        firstId: senderId,
        secondId: receiverId,
      }))
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    await markConversationRead({ senderId, receiverId });

    res.status(204).end();
  } catch (e) {
    res.status(500).json({ message: "Failed to mark read" });
  }
});

/**
 * GET /api/chat/:userId1/:userId2
 * Історія чату
 */
router.get("/:userId1/:userId2", protect, async (req, res) => {
  try {
    const { userId1, userId2 } = req.params;
    if (!userId1 || !userId2) {
      return res.status(400).json({ message: "Two user ids required" });
    }

    if (
      !(await canAccessSupportConversation({
        currentUser: req.user,
        firstId: userId1,
        secondId: userId2,
      }))
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const history = await getConversationHistory({ userId1, userId2 });

    res.json(history);
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
