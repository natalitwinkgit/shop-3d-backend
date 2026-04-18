import { telegramEnv } from "../config/env.js";
import { answerTelegramCallback, sendTelegramMessage } from "../integrations/telegramApi.js";
import { webAppClient } from "../integrations/webAppClient.js";
import { createHttpError } from "../utils/httpError.js";
import {
  confirmActionRequestFromTelegram,
  confirmBindCode,
} from "./authRequestService.js";
import {
  getActiveBindingByTelegramUserId,
  unlinkTelegramBinding,
  updateNotificationPreferences,
} from "./bindingService.js";
import { writeAuditLog } from "./auditService.js";

const html = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const siteUrl = (path = "") => {
  if (!telegramEnv.websiteBaseUrl) return "";
  return `${telegramEnv.websiteBaseUrl.replace(/\/+$/, "")}${path}`;
};

const mainKeyboard = () => ({
  inline_keyboard: [
    [{ text: "Мої замовлення", callback_data: "nav:orders" }],
    [{ text: "Моя знижка", callback_data: "nav:discount" }],
    [{ text: "Обране", callback_data: "nav:favorites" }],
    [{ text: "Налаштування сповіщень", callback_data: "nav:notifications" }],
    ...(siteUrl() ? [[{ text: "Відкрити сайт", url: siteUrl() }]] : []),
  ],
});

const authKeyboard = () => ({
  inline_keyboard: [
    ...(siteUrl("/profile") ? [[{ text: "Відкрити сайт", url: siteUrl("/profile") }]] : []),
  ],
});

const requireBinding = async (from, chatId) => {
  const binding = await getActiveBindingByTelegramUserId(from?.id);
  if (!binding) {
    await sendTelegramMessage({
      chatId,
      text:
        "Telegram ще не підключено до акаунта.\n\nЗайдіть у профіль на сайті, натисніть “Підключити Telegram” і надішліть сюди код привʼязки.",
      replyMarkup: authKeyboard(),
    });
    return null;
  }
  return binding;
};

const renderFallbackUnavailable = (section) =>
  `${section} зараз недоступний у боті. Спробуйте відкрити сайт.`;

const sendStart = async ({ chatId, from, text }) => {
  const startArg = String(text || "").split(/\s+/)[1] || "";
  if (startArg) {
    return sendBindCode({ chatId, from, code: startArg });
  }

  const binding = await getActiveBindingByTelegramUserId(from?.id);
  if (!binding) {
    return sendTelegramMessage({
      chatId,
      text:
        "Вітаю. Я бот меблевого магазину.\n\nЩоб підключити Telegram, відкрийте профіль на сайті, натисніть “Підключити Telegram” і надішліть сюди код.",
      replyMarkup: authKeyboard(),
    });
  }

  return sendTelegramMessage({
    chatId,
    text: `Telegram підключено до акаунта${binding.userPreview?.name ? `: ${html(binding.userPreview.name)}` : ""}.`,
    replyMarkup: mainKeyboard(),
  });
};

const sendHelp = ({ chatId }) =>
  sendTelegramMessage({
    chatId,
    text: [
      "<b>Команди</b>",
      "/start - старт і перевірка привʼязки",
      "/profile - коротка інформація профілю",
      "/orders - останні замовлення",
      "/discount - дисконтна картка",
      "/favorites - обране",
      "/notifications - налаштування сповіщень",
      "/login - як підтвердити вхід на сайт",
      "/unlink - відвʼязати Telegram",
    ].join("\n"),
    replyMarkup: mainKeyboard(),
  });

const sendBindCode = async ({ chatId, from, code }) => {
  try {
    await confirmBindCode({
      code,
      from,
      chat: { id: chatId },
    });
    return sendTelegramMessage({
      chatId,
      text: "Telegram успішно підключено до акаунта. Тепер ви можете отримувати сповіщення і користуватися кабінетом у боті.",
      replyMarkup: mainKeyboard(),
    });
  } catch (error) {
    const messages = {
      BIND_CODE_NOT_FOUND: "Код не знайдено. Перевірте код або створіть новий у профілі на сайті.",
      BIND_CODE_EXPIRED: "Код прострочений. Створіть новий код у профілі на сайті.",
      TELEGRAM_ALREADY_BOUND: "Цей Telegram уже привʼязаний до іншого акаунта.",
      WEBSITE_USER_ALREADY_BOUND: "Цей акаунт уже має привʼязаний інший Telegram.",
      TOO_MANY_CODE_ATTEMPTS: "Забагато спроб. Створіть новий код у профілі на сайті.",
    };
    return sendTelegramMessage({
      chatId,
      text: messages[error.code] || "Не вдалося підтвердити код. Спробуйте ще раз.",
      replyMarkup: authKeyboard(),
    });
  }
};

const sendProfile = async ({ chatId, from }) => {
  const binding = await requireBinding(from, chatId);
  if (!binding) return;

  const response = await webAppClient.getProfile(binding.websiteUserId);
  if (!response.ok) {
    return sendTelegramMessage({
      chatId,
      text: [
        "<b>Профіль</b>",
        binding.userPreview?.name ? `Імʼя: ${html(binding.userPreview.name)}` : "",
        binding.userPreview?.email ? `Email: ${html(binding.userPreview.email)}` : "",
        binding.userPreview?.phone ? `Телефон: ${html(binding.userPreview.phone)}` : "",
      ]
        .filter(Boolean)
        .join("\n") || renderFallbackUnavailable("Профіль"),
      replyMarkup: mainKeyboard(),
    });
  }

  const profile = response.data?.profile || response.data || {};
  return sendTelegramMessage({
    chatId,
    text: [
      "<b>Профіль</b>",
      profile.name ? `Імʼя: ${html(profile.name)}` : "",
      profile.email ? `Email: ${html(profile.email)}` : "",
      profile.phone ? `Телефон: ${html(profile.phone)}` : "",
      profile.discountPercent ? `Знижка: ${html(profile.discountPercent)}%` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    replyMarkup: mainKeyboard(),
  });
};

const sendOrders = async ({ chatId, from }) => {
  const binding = await requireBinding(from, chatId);
  if (!binding) return;

  const response = await webAppClient.getOrders(binding.websiteUserId);
  const orders = response.data?.orders || response.data?.items || [];
  if (!response.ok || !orders.length) {
    return sendTelegramMessage({
      chatId,
      text: response.ok ? "Останніх замовлень поки немає." : renderFallbackUnavailable("Замовлення"),
      replyMarkup: mainKeyboard(),
    });
  }

  const text = orders
    .slice(0, 5)
    .map((order) =>
      [
        `<b>Замовлення ${html(order.number || order.id || "")}</b>`,
        order.status ? `Статус: ${html(order.status)}` : "",
        order.createdAt ? `Дата: ${html(new Date(order.createdAt).toLocaleDateString("uk-UA"))}` : "",
        order.total ? `Сума: ${html(order.total)}` : "",
        Array.isArray(order.items) && order.items.length
          ? `Склад: ${html(order.items.map((item) => item.name || item.title).filter(Boolean).slice(0, 3).join(", "))}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");

  return sendTelegramMessage({ chatId, text, replyMarkup: mainKeyboard() });
};

const sendDiscount = async ({ chatId, from }) => {
  const binding = await requireBinding(from, chatId);
  if (!binding) return;

  const response = await webAppClient.getDiscount(binding.websiteUserId);
  const discount = response.data?.discount || response.data || {};
  if (!response.ok) {
    return sendTelegramMessage({
      chatId,
      text: renderFallbackUnavailable("Дисконтна картка"),
      replyMarkup: mainKeyboard(),
    });
  }

  return sendTelegramMessage({
    chatId,
    text: [
      "<b>Дисконтна картка</b>",
      discount.cardNumber ? `Номер: ${html(discount.cardNumber)}` : "",
      discount.percent !== undefined ? `Знижка: ${html(discount.percent)}%` : "",
      discount.history?.length ? `Останнє використання: ${html(discount.history[0].date || "")}` : "",
      discount.qrUrl ? "QR доступний у веб-версії кабінету." : "",
    ]
      .filter(Boolean)
      .join("\n") || "Дисконтна картка ще не активна.",
    replyMarkup: mainKeyboard(),
  });
};

const sendFavorites = async ({ chatId, from }) => {
  const binding = await requireBinding(from, chatId);
  if (!binding) return;

  const response = await webAppClient.getFavorites(binding.websiteUserId);
  const favorites = response.data?.favorites || response.data?.items || [];
  if (!response.ok || !favorites.length) {
    return sendTelegramMessage({
      chatId,
      text: response.ok ? "В обраному поки немає товарів." : renderFallbackUnavailable("Обране"),
      replyMarkup: mainKeyboard(),
    });
  }

  const text = favorites
    .slice(0, 8)
    .map((item, index) => `${index + 1}. ${html(item.name || item.title || item.slug || item.id)}`)
    .join("\n");

  return sendTelegramMessage({
    chatId,
    text: `<b>Обране</b>\n${text}`,
    replyMarkup: {
      inline_keyboard: [
        ...(favorites[0]?.url ? [[{ text: "Відкрити товар", url: favorites[0].url }]] : []),
        ...mainKeyboard().inline_keyboard,
      ],
    },
  });
};

const preferenceLabels = {
  orderStatus: "Статуси замовлень",
  promotions: "Акції",
  personalDiscounts: "Персональні знижки",
  abandonedCart: "Покинуті кошики",
  backInStock: "Наявність товару",
  priceDrop: "Зміна ціни",
  unfinishedOrder: "Незавершене замовлення",
  service: "Сервісні повідомлення",
};

const sendNotifications = async ({ chatId, from }) => {
  const binding = await requireBinding(from, chatId);
  if (!binding) return;

  const prefs = binding.notificationPreferences || {};
  return sendTelegramMessage({
    chatId,
    text: "<b>Налаштування сповіщень</b>",
    replyMarkup: {
      inline_keyboard: Object.entries(preferenceLabels).map(([key, label]) => [
        {
          text: `${prefs[key] === false ? "Вимкнено" : "Увімкнено"} - ${label}`,
          callback_data: `pref_toggle:${key}`,
        },
      ]),
    },
  });
};

const sendLoginHelp = async ({ chatId, from }) => {
  const binding = await requireBinding(from, chatId);
  if (!binding) return;

  return sendTelegramMessage({
    chatId,
    text:
      "Щоб увійти через Telegram, виберіть на сайті “Увійти через код у Telegram”. Тут зʼявиться кнопка “Підтвердити вхід”.",
    replyMarkup: mainKeyboard(),
  });
};

const sendUnlink = async ({ chatId, from }) => {
  const binding = await requireBinding(from, chatId);
  if (!binding) return;

  await unlinkTelegramBinding({ telegramUserId: from.id });
  return sendTelegramMessage({
    chatId,
    text: "Telegram відвʼязано від акаунта. Щоб підключити знову, створіть новий код у профілі на сайті.",
    replyMarkup: authKeyboard(),
  });
};

const commandHandlers = {
  "/start": sendStart,
  "/help": sendHelp,
  "/profile": sendProfile,
  "/orders": sendOrders,
  "/discount": sendDiscount,
  "/favorites": sendFavorites,
  "/notifications": sendNotifications,
  "/login": sendLoginHelp,
  "/unlink": sendUnlink,
};

const handleMessage = async (message) => {
  const text = String(message?.text || "").trim();
  const chatId = String(message?.chat?.id || "");
  const from = message?.from || {};
  if (!text || !chatId) return;

  const command = text.startsWith("/") ? text.split(/\s+/)[0].split("@")[0] : "";
  if (command && commandHandlers[command]) {
    return commandHandlers[command]({ chatId, from, text });
  }

  if (/^\d{4,8}$/.test(text)) {
    return sendBindCode({ chatId, from, code: text });
  }

  return sendTelegramMessage({
    chatId,
    text: "Не розумію команду. Натисніть /help, щоб побачити можливості.",
    replyMarkup: mainKeyboard(),
  });
};

const handleCallbackQuery = async (callbackQuery) => {
  const data = String(callbackQuery?.data || "");
  const from = callbackQuery?.from || {};
  const chatId = String(callbackQuery?.message?.chat?.id || from?.id || "");

  if (data.startsWith("nav:")) {
    await answerTelegramCallback({ callbackQueryId: callbackQuery.id });
    const section = data.slice(4);
    if (section === "orders") return sendOrders({ chatId, from });
    if (section === "discount") return sendDiscount({ chatId, from });
    if (section === "favorites") return sendFavorites({ chatId, from });
    if (section === "notifications") return sendNotifications({ chatId, from });
  }

  if (data.startsWith("login_confirm:") || data.startsWith("recovery_confirm:")) {
    const [prefix, requestId] = data.split(":");
    const kind = prefix.replace("_confirm", "");
    try {
      await confirmActionRequestFromTelegram({
        requestId,
        kind,
        from,
        chat: { id: chatId },
      });
      await answerTelegramCallback({
        callbackQueryId: callbackQuery.id,
        text: kind === "login" ? "Вхід підтверджено" : "Відновлення підтверджено",
      });
      return sendTelegramMessage({
        chatId,
        text:
          kind === "login"
            ? "Вхід підтверджено. Поверніться на сайт, авторизація завершиться автоматично."
            : "Запит підтверджено. Поверніться на сайт, щоб задати новий пароль.",
      });
    } catch (error) {
      await answerTelegramCallback({
        callbackQueryId: callbackQuery.id,
        text: error.code === "REQUEST_EXPIRED" ? "Запит прострочений" : "Не вдалося підтвердити",
        showAlert: true,
      });
      throw error;
    }
  }

  if (data.startsWith("pref_toggle:")) {
    const key = data.slice("pref_toggle:".length);
    const binding = await getActiveBindingByTelegramUserId(from.id);
    if (!binding) {
      await answerTelegramCallback({ callbackQueryId: callbackQuery.id, text: "Акаунт не привʼязано" });
      return requireBinding(from, chatId);
    }

    const current = binding.notificationPreferences?.[key] !== false;
    await updateNotificationPreferences({
      telegramUserId: from.id,
      preferences: { [key]: !current },
    });
    await answerTelegramCallback({
      callbackQueryId: callbackQuery.id,
      text: !current ? "Сповіщення увімкнено" : "Сповіщення вимкнено",
    });
    return sendNotifications({ chatId, from });
  }

  return answerTelegramCallback({ callbackQueryId: callbackQuery.id });
};

export const handleTelegramUpdate = async (update) => {
  try {
    if (update?.message) return await handleMessage(update.message);
    if (update?.callback_query) return await handleCallbackQuery(update.callback_query);
  } catch (error) {
    const chatId =
      update?.message?.chat?.id ||
      update?.callback_query?.message?.chat?.id ||
      update?.callback_query?.from?.id;
    if (chatId) {
      await sendTelegramMessage({
        chatId,
        text: "Сталася помилка. Спробуйте ще раз або відкрийте сайт.",
        replyMarkup: mainKeyboard(),
      }).catch(() => null);
    }
    await writeAuditLog({
      eventType: "bot.update_error",
      telegramUserId: String(update?.message?.from?.id || update?.callback_query?.from?.id || ""),
      chatId: String(chatId || ""),
      ok: false,
      reason: error.message,
    });
    if (error?.status) throw error;
    throw createHttpError(500, "Telegram update handling failed", "BOT_UPDATE_FAILED");
  }
};
