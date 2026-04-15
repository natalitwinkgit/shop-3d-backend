import OpenAI, { toFile } from "openai";

import { getEffectiveAiConfig, DEFAULT_GEMINI_MODEL } from "./aiConfigService.js";

const pickStr = (value) => String(value || "").trim();

const createServiceError = (message, statusCode = 500, raw = null) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (raw) error.raw = raw;
  return error;
};

const DEFAULT_OPENAI_STT_MODEL = String(process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe").trim();
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

const getGeminiApiKeyAndModel = async () => {
  const config = await getEffectiveAiConfig();
  const apiKey = pickStr(config.geminiApiKey);
  const model = pickStr(config.geminiModel) || DEFAULT_GEMINI_MODEL;
  if (!apiKey) {
    throw createServiceError("GEMINI_API_KEY is not configured", 503);
  }
  return { apiKey, model };
};

const transcribeWithGemini = async ({ audioBuffer, mimeType = "audio/webm", language = "uk-UA" }) => {
  const { apiKey, model } = await getGeminiApiKeyAndModel();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Transcribe this speech to plain text in ${language}. Return only transcript text without markdown or comments.`,
            },
            {
              inlineData: {
                mimeType,
                data: Buffer.from(audioBuffer || Buffer.alloc(0)).toString("base64"),
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 400,
      },
    }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw createServiceError(
      json?.error?.message || "STT request failed",
      response.status || 502,
      json
    );
  }

  const text = (json?.candidates?.[0]?.content?.parts || [])
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join(" ")
    .trim();

  return text;
};

const normalizeOpenAiLanguage = (language = "") => {
  const normalized = pickStr(language).toLowerCase();
  if (normalized.startsWith("uk")) return "uk";
  if (normalized.startsWith("en")) return "en";
  return "";
};

const transcribeWithOpenAi = async ({ audioBuffer, mimeType = "audio/webm", language = "uk-UA" }) => {
  const config = await getEffectiveAiConfig();
  const apiKey = pickStr(config.openaiApiKey || config.activeApiKey);
  const client = getOpenAiClient(apiKey);
  const file = await toFile(Buffer.from(audioBuffer || Buffer.alloc(0)), "speech.webm", {
    type: mimeType,
  });

  const response = await client.audio.transcriptions.create({
    file,
    model: DEFAULT_OPENAI_STT_MODEL,
    ...(normalizeOpenAiLanguage(language) ? { language: normalizeOpenAiLanguage(language) } : {}),
  });

  return pickStr(response?.text || "");
};

export const transcribeAudioToText = async ({
  audioBuffer,
  mimeType,
  fallbackTranscript = "",
  language = "uk-UA",
}) => {
  const fallback = pickStr(fallbackTranscript);
  if (!audioBuffer?.length) return fallback;

  try {
    const transcript = await transcribeWithGemini({ audioBuffer, mimeType, language });
    return pickStr(transcript) || fallback;
  } catch (error) {
    try {
      const transcript = await transcribeWithOpenAi({ audioBuffer, mimeType, language });
      return pickStr(transcript) || fallback;
    } catch (openAiError) {
      if (fallback) return fallback;
      throw createServiceError(
        "Voice transcription service is temporarily unavailable",
        503,
        { gemini: error?.message || "", openai: openAiError?.message || "" }
      );
    }
  }
};
