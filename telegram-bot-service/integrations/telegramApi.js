import { telegramEnv } from "../config/env.js";
import { logger } from "../utils/logger.js";

const apiUrl = (method) =>
  `https://api.telegram.org/bot${telegramEnv.botToken}/${method}`;

const callTelegram = async (method, payload = {}) => {
  const response = await fetch(apiUrl(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) {
    const description = data?.description || `Telegram API ${method} failed`;
    const error = new Error(description);
    error.status = response.status;
    error.telegramResponse = data;
    throw error;
  }

  return data?.result;
};

export const sendTelegramMessage = async ({
  chatId,
  text,
  replyMarkup,
  parseMode = "HTML",
  disableWebPagePreview = true,
}) =>
  callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
    disable_web_page_preview: disableWebPagePreview,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });

export const answerTelegramCallback = async ({ callbackQueryId, text = "", showAlert = false }) =>
  callTelegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });

export const setTelegramWebhook = async (url) =>
  callTelegram("setWebhook", {
    url,
    secret_token: telegramEnv.webhookSecret || undefined,
    allowed_updates: ["message", "callback_query"],
  });

export const setTelegramCommands = async (commands = []) =>
  callTelegram("setMyCommands", {
    commands,
    scope: { type: "default" },
    language_code: "uk",
  });

export const setTelegramMenuButton = async () =>
  callTelegram("setChatMenuButton", {
    menu_button: { type: "commands" },
  });

export const configureTelegramBotMenu = async (commands = []) => {
  await setTelegramCommands(commands);
  await setTelegramMenuButton();
};

export const deleteTelegramWebhook = async () => callTelegram("deleteWebhook", {});

export const getTelegramUpdates = async ({ offset = 0, timeout = 30 } = {}) =>
  callTelegram("getUpdates", {
    offset,
    timeout,
    allowed_updates: ["message", "callback_query"],
  });

export const safeSendTelegramMessage = async (params) => {
  try {
    return await sendTelegramMessage(params);
  } catch (error) {
    const description = String(error?.message || "");
    if (
      description.includes("bot was blocked") ||
      description.includes("chat not found") ||
      description.includes("user is deactivated")
    ) {
      error.code = "TELEGRAM_CHAT_UNAVAILABLE";
    }
    logger.warn("Telegram message delivery failed", { chatId: params?.chatId }, error);
    throw error;
  }
};
