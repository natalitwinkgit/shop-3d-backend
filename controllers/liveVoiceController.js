import { createChatMessage, emitChatLiveStatus } from "../services/chatMessageService.js";
import { transcribeAudioToText } from "../services/voiceSttService.js";
import {
  buildVoiceAssistantSpeechText,
  generateLiveAssistantReply,
  resolveLiveConversationContext,
} from "../services/voiceAiService.js";
import { buildTtsPayload } from "../services/voiceTtsService.js";
import { createHttpError } from "../services/productPayloadService.js";

const pickStr = (value) => String(value || "").trim();

const resolveConversationId = ({ req, userId, assistantId }) =>
  pickStr(req.body?.conversationId) || [userId, assistantId].sort().join(":");

const resolveTurnMode = ({ req, defaultMode }) =>
  defaultMode === "text" ? "text" : pickStr(req.body?.mode) || defaultMode;

const resolveUserText = async ({ req }) =>
  pickStr(req.body?.text || req.body?.transcript) ||
  transcribeAudioToText({
    audioBuffer: req.file?.buffer || Buffer.alloc(0),
    mimeType: pickStr(req.file?.mimetype) || "audio/webm",
    fallbackTranscript: "",
    language: pickStr(req.body?.language) || "uk-UA",
  });

const buildMessageType = ({ defaultMode, turnMode, hasAudio }) => {
  if (defaultMode === "text" || turnMode === "text") return "text";
  return hasAudio ? "voice" : "text";
};

const isRecoverableTurnError = (error) => {
  const status = Number(error?.statusCode || error?.status || 0);
  const message = pickStr(error?.message || error?.raw?.message || "").toLowerCase();

  if (status >= 500) return true;

  return (
    /speech was not recognized|text was not provided|temporarily unavailable|denied access|access denied|permission denied/.test(
      message
    )
  );
};

const buildFallbackAssistantText = (error) => {
  const message = pickStr(error?.message || error?.raw?.message || "").toLowerCase();
  if (/speech was not recognized|text was not provided/.test(message)) {
    return "Не вдалося розпізнати голос. Спробуйте ще раз або введіть текстом.";
  }

  return "Сервіс відповіді тимчасово недоступний. Спробуйте ще раз або введіть текстом.";
};

const createTurnHandler = (defaultMode) => async (req, res, next) => {
  let session = null;
  let userId = "";
  let assistantId = "";
  let turnMode = defaultMode;
  let hasAudio = false;
  let conversationId = "";
  let participants = [];
  let messageType = "text";
  let audioMeta = null;

  try {
    session = await resolveLiveConversationContext({ currentUser: req.user });
    userId = session.userId;
    assistantId = session.adminId;
    turnMode = resolveTurnMode({ req, defaultMode });
    hasAudio = Boolean(req.file?.buffer?.length);
    conversationId = resolveConversationId({ req, userId, assistantId });
    participants = [userId, assistantId];
    messageType = buildMessageType({ defaultMode, turnMode, hasAudio });
    audioMeta = hasAudio
      ? {
          mimeType: pickStr(req.file?.mimetype),
          size: Number(req.file?.size || 0),
          originalName: pickStr(req.file?.originalname),
        }
      : null;

    emitChatLiveStatus({ participants, conversationId, state: "processing", mode: turnMode });

    const transcript = await resolveUserText({ req });
    const userText = pickStr(transcript);
    if (!userText) {
      throw createHttpError(
        400,
        turnMode === "text" ? "Text was not provided" : "Speech was not recognized"
      );
    }

    const userMessage = await createChatMessage({
      sender: userId,
      receiver: assistantId,
      text: userText,
      source: "human",
      meta: {
        type: messageType,
        mode: turnMode,
        status: "final",
        ...(audioMeta ? { audio: audioMeta } : {}),
      },
    });

    const assistantReply = await generateLiveAssistantReply({
      userId,
      adminId: assistantId,
      userText,
    });
    const assistantText =
      pickStr(assistantReply?.text ?? assistantReply) ||
      "Перепрошую, не вдалося сформувати відповідь. Спробуйте ще раз.";
    const productCards = Array.isArray(assistantReply?.productCards)
      ? assistantReply.productCards
      : [];
    const assistantSpeechText = buildVoiceAssistantSpeechText({
      assistantReply,
      assistantText,
      turnMode,
    });

    emitChatLiveStatus({ participants, conversationId, state: "speaking", mode: turnMode });

    const assistantMessage = await createChatMessage({
      sender: assistantId,
      receiver: userId,
      text: assistantText,
      source: "ai_admin",
      meta: {
        type: messageType,
        mode: turnMode,
        status: "final",
        speechText: assistantSpeechText,
        ...(productCards.length ? { productCards, productSearch: assistantReply?.productSearch || null } : {}),
      },
    });

    const tts = await buildTtsPayload({ text: assistantSpeechText });
    emitChatLiveStatus({ participants, conversationId, state: "idle", mode: turnMode });

    return res.status(201).json({
      conversationId,
      mode: turnMode,
      state: "idle",
      userMessage,
      assistantMessage,
      transcript: userText,
      tts,
      products: productCards,
    });
  } catch (error) {
    if (session && isRecoverableTurnError(error)) {
      const fallbackText = buildFallbackAssistantText(error);
      const fallbackSpeechText = buildVoiceAssistantSpeechText({
        assistantText: fallbackText,
        turnMode,
      });
      emitChatLiveStatus({ participants, conversationId, state: "idle", mode: turnMode });

      let assistantMessage = {
        sender: assistantId,
        receiver: userId,
        text: fallbackText,
        source: "ai_admin",
        meta: {
          type: messageType,
          mode: turnMode,
          status: "final",
          fallbackReason: "live_turn_unavailable",
          speechText: fallbackSpeechText,
          ...(audioMeta ? { audio: audioMeta } : {}),
        },
      };

      try {
        assistantMessage = await createChatMessage({
          sender: assistantId,
          receiver: userId,
          text: fallbackText,
          source: "ai_admin",
          meta: assistantMessage.meta,
        });
      } catch {
        // Return a synthetic assistant message if persistence is unavailable.
      }

      const tts = await buildTtsPayload({ text: fallbackSpeechText });

      return res.status(201).json({
        conversationId,
        mode: turnMode,
        state: "idle",
        userMessage: null,
        assistantMessage,
        transcript: "",
        tts,
        products: [],
      });
    }

    return next(error);
  }
};

export const handleLiveVoiceTurn = createTurnHandler("live");
export const handleTextChatTurn = createTurnHandler("text");
