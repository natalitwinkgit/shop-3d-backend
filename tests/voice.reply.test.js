import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCatalogSpokenText,
  buildVoiceAssistantSpeechText,
  isLikelyCatalogFallbackSearch,
} from "../services/voiceAiService.js";

test("catalog speech uses a short voice-friendly summary", () => {
  const speech = buildCatalogSpokenText({
    items: [
      {
        title: "Дитяче ліжко Orion",
      },
    ],
  });

  assert.match(speech, /Знайшов товар у каталозі/);
  assert.doesNotMatch(speech, /\d+\./);
});

test("catalog speech handles empty search results", () => {
  const speech = buildCatalogSpokenText({
    items: [],
  });

  assert.match(speech, /Не знайшов точного збігу/);
  assert.doesNotMatch(speech, /Знайшов товар у каталозі/);
});

test("voice assistant speech prefers spokenText for live mode", () => {
  const speech = buildVoiceAssistantSpeechText({
    turnMode: "live",
    assistantText: "Знайшов у каталозі найкращий варіант:",
    assistantReply: {
      spokenText: "Знайшов товар у каталозі. Ви можете переглянути його у картці нижче.",
    },
  });

  assert.equal(
    speech,
    "Знайшов товар у каталозі. Ви можете переглянути його у картці нижче."
  );
});

test("text mode keeps the display reply as-is", () => {
  const speech = buildVoiceAssistantSpeechText({
    turnMode: "text",
    assistantText: "Знайшов у каталозі найкращий варіант:\n1. Дитяче ліжко Orion — 21 120 грн",
    assistantReply: {
      spokenText: "Знайшов товар у каталозі. Ви можете переглянути його у картці нижче.",
    },
  });

  assert.match(speech, /Дитяче ліжко Orion/);
  assert.doesNotMatch(speech, /Ви можете переглянути його у картці нижче/);
});

test("catalog fallback accepts confident product matches when AI is unavailable", () => {
  assert.equal(
    isLikelyCatalogFallbackSearch({
      isProductQuery: true,
      items: [{ matchScore: 1 }],
    }),
    true
  );

  assert.equal(
    isLikelyCatalogFallbackSearch({
      isProductQuery: false,
      items: [{ matchScore: 8 }],
    }),
    true
  );

  assert.equal(
    isLikelyCatalogFallbackSearch({
      isProductQuery: false,
      items: [{ matchScore: 7 }],
    }),
    false
  );

  assert.equal(
    isLikelyCatalogFallbackSearch({
      isProductQuery: false,
      items: [],
    }),
    false
  );
});
