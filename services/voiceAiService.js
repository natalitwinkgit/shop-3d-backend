import OpenAI from "openai";

import { getConversationHistory, getSupportAdminProfile } from "./adminChatService.js";
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_GEMINI_MODEL,
  getEffectiveAiConfig,
} from "./aiConfigService.js";
import { buildProductCards } from "./catalogProductCardService.js";
import {
  buildCatalogReply,
  isCatalogProductQuery,
  searchCatalogProducts,
} from "./catalogSearchService.js";

const pickStr = (value) => String(value || "").trim();
const toRole = (message) => (message?.source === "ai_admin" ? "assistant" : "user");

const createServiceError = (message, statusCode = 500, raw = null) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (raw) error.raw = raw;
  return error;
};

let openaiClient = null;
let openaiClientApiKey = "";

const getOpenAiClient = (apiKey) => {
  const safeApiKey = pickStr(apiKey);
  if (!safeApiKey) {
    throw createServiceError("OPENAI_API_KEY is not configured", 503);
  }

  if (!openaiClient || openaiClientApiKey !== safeApiKey) {
    openaiClient = new OpenAI({ apiKey: safeApiKey });
    openaiClientApiKey = safeApiKey;
  }

  return openaiClient;
};

const buildConversationHistoryBlock = (history = []) =>
  history
    .slice(-20)
    .map((item) => `${toRole(item)}: ${pickStr(item.text)}`)
    .join("\n");

const buildAssistantInstructions = ({ history = [] }) => {
  const compactHistory = buildConversationHistoryBlock(history);

  return [
    "You are a concise support assistant for a furniture ecommerce store.",
    "Answer clearly and practically. Keep answers short when possible.",
    "Do not invent product availability, prices, colors, delivery dates, or policy details.",
    compactHistory ? `Conversation history:\n${compactHistory}` : "",
    "If the user asks about products, the backend handles verified catalog lookups separately.",
    "Reply in Ukrainian unless the conversation clearly uses another language.",
  ]
    .filter(Boolean)
    .join("\n\n");
};

const buildUserInput = ({ userText = "" }) => `User: ${pickStr(userText)}`;

const callGeminiReply = async ({ apiKey, model, instructions, input }) => {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        role: "system",
        parts: [{ text: instructions }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: input }],
        },
      ],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 500,
      },
    }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw createServiceError(
      json?.error?.message || "Gemini request failed",
      response.status || 502,
      json
    );
  }

  return (json?.candidates?.[0]?.content?.parts || [])
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join(" ")
    .trim();
};

const callOpenAiReply = async ({ apiKey, model, instructions, input }) => {
  const client = getOpenAiClient(apiKey);
  const response = await client.responses.create({
    model,
    instructions,
    input,
    max_output_tokens: 500,
  });

  return pickStr(response?.output_text || "");
};

const buildUnavailableReply = () => ({
  text: "Перепрошую, зараз сервіс відповіді тимчасово недоступний. Спробуйте ще раз або введіть запит текстом.",
  spokenText: "Перепрошую, зараз сервіс відповіді тимчасово недоступний. Спробуйте ще раз або введіть запит текстом.",
  productCards: [],
  productSearch: null,
  fallbackReason: "ai_provider_unavailable",
});

const CATALOG_FALLBACK_MATCH_SCORE = 8;

const getTopCatalogMatch = (searchResult = {}) => {
  const items = Array.isArray(searchResult?.items) ? searchResult.items.filter(Boolean) : [];
  return items[0] || null;
};

export const isLikelyCatalogFallbackSearch = (searchResult = {}) => {
  const topItem = getTopCatalogMatch(searchResult);
  if (!topItem) return false;
  if (searchResult?.isProductQuery) return true;

  return Number(topItem.matchScore || 0) >= CATALOG_FALLBACK_MATCH_SCORE;
};

const buildCatalogFallbackReply = (searchResult = {}) => ({
  text: buildCatalogReply(searchResult),
  spokenText: buildCatalogSpokenText(searchResult),
  productCards: buildProductCards(searchResult.items),
  productSearch: searchResult,
  fallbackReason: "ai_provider_unavailable_catalog_fallback",
});

export const buildCatalogSpokenText = (searchResult = {}) => {
  const items = Array.isArray(searchResult?.items) ? searchResult.items.filter(Boolean) : [];
  if (!items.length) {
    return "Не знайшов точного збігу в каталозі. Спробуйте уточнити запит.";
  }
  if (items.length === 1) {
    return "Знайшов товар у каталозі. Ви можете переглянути його у картці нижче.";
  }
  return `Знайшов ${items.length} товари у каталозі. Ви можете переглянути їх у картках нижче.`;
};

export const resolveLiveConversationContext = async ({ currentUser }) => {
  const admin = await getSupportAdminProfile({ currentUser });
  if (!admin?.adminId) {
    throw createServiceError("Support admin is unavailable", 503);
  }

  return {
    userId: String(currentUser?._id || currentUser?.id || ""),
    adminId: String(admin.adminId),
  };
};

export const generateLiveAssistantReply = async ({ userId, adminId, userText }) => {
  if (isCatalogProductQuery(userText)) {
    const catalogSearch = await searchCatalogProducts({
      query: userText,
      limit: 1,
    });
    return {
      text: buildCatalogReply(catalogSearch),
      spokenText: buildCatalogSpokenText(catalogSearch),
      productCards: buildProductCards(catalogSearch.items),
      productSearch: catalogSearch,
    };
  }

  const aiConfig = await getEffectiveAiConfig();
  const provider = pickStr(aiConfig.provider) || "gemini";
  const model =
    provider === "openai"
      ? pickStr(aiConfig.activeModel) || DEFAULT_OPENAI_MODEL
      : pickStr(aiConfig.activeModel) || pickStr(aiConfig.geminiModel) || DEFAULT_GEMINI_MODEL;
  const apiKey =
    provider === "openai"
      ? pickStr(aiConfig.openaiApiKey) || pickStr(aiConfig.activeApiKey)
      : pickStr(aiConfig.geminiApiKey) || pickStr(aiConfig.activeApiKey);

  const history = await getConversationHistory({ userId1: userId, userId2: adminId });
  const instructions = buildAssistantInstructions({ history });
  const input = buildUserInput({ userText });
  const candidates = provider === "openai"
    ? [
        { provider: "openai", apiKey, model },
        {
          provider: "gemini",
          apiKey: pickStr(aiConfig.geminiApiKey) || pickStr(aiConfig.activeApiKey),
          model: pickStr(aiConfig.geminiModel) || DEFAULT_GEMINI_MODEL,
        },
      ]
    : [
        { provider: "gemini", apiKey, model },
        {
          provider: "openai",
          apiKey: pickStr(aiConfig.openaiApiKey) || pickStr(aiConfig.activeApiKey),
          model: pickStr(aiConfig.openaiModel) || DEFAULT_OPENAI_MODEL,
        },
      ];

  for (const candidate of candidates) {
    if (!pickStr(candidate.apiKey)) continue;

    try {
      const text =
        candidate.provider === "openai"
          ? await callOpenAiReply({
              apiKey: candidate.apiKey,
              model: candidate.model,
              instructions,
              input,
            })
          : await callGeminiReply({
              apiKey: candidate.apiKey,
              model: candidate.model,
              instructions,
              input,
            });

      const safeText = pickStr(text);
      if (!safeText) {
        throw createServiceError("AI response was empty", 502);
      }

      return {
        text: safeText,
        spokenText: safeText,
        productCards: [],
        productSearch: null,
        provider: candidate.provider,
      };
    } catch {
      // Try the next configured provider.
    }
  }

  const catalogFallback = await searchCatalogProducts({
    query: userText,
    limit: 1,
  });

  if (isLikelyCatalogFallbackSearch(catalogFallback)) {
    return {
      ...buildCatalogFallbackReply(catalogFallback),
      provider: "catalog",
    };
  }

  return buildUnavailableReply();
};

export const buildVoiceAssistantSpeechText = ({ assistantReply = null, assistantText = "", turnMode = "live" } = {}) => {
  const safeAssistantText = pickStr(assistantText);
  if (turnMode === "text") return safeAssistantText;

  const replySpeechText = pickStr(assistantReply?.spokenText);
  if (replySpeechText) return replySpeechText;

  return safeAssistantText;
};
