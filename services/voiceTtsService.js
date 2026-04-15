const pickStr = (value) => String(value || "").trim();

export const buildTtsPayload = async ({ text = "" } = {}) => {
  const cleanText = pickStr(text);
  if (!cleanText) return null;

  return {
    provider: "frontend_speech_synthesis",
    audioUrl: "",
    voice: pickStr(process.env.LIVE_VOICE_TTS_VOICE || "default"),
    text: cleanText,
  };
};
