import { telegramEnv } from "../config/env.js";
import { answerTelegramCallback, sendTelegramMessage } from "../integrations/telegramApi.js";
import { webAppClient } from "../integrations/webAppClient.js";
import {
  confirmBindByPhoneContact,
  confirmActionRequestFromTelegram,
  confirmBindCodeWithContact,
  prepareBindCodeConfirmation,
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

const pendingBindCodes = new Map();
const PENDING_BIND_CODE_TTL_MS = 10 * 60 * 1000;

const pendingBindKey = ({ chatId, from }) => `${String(chatId || "")}:${String(from?.id || "")}`;

const rememberPendingBindCode = ({ chatId, from, code }) => {
  pendingBindCodes.set(pendingBindKey({ chatId, from }), {
    code: String(code || "").trim(),
    expiresAt: Date.now() + PENDING_BIND_CODE_TTL_MS,
  });
};

const takePendingBindCode = ({ chatId, from }) => {
  const key = pendingBindKey({ chatId, from });
  const entry = pendingBindCodes.get(key);
  if (!entry) return "";
  if (entry.expiresAt <= Date.now()) {
    pendingBindCodes.delete(key);
    return "";
  }
  pendingBindCodes.delete(key);
  return entry.code;
};

const siteUrl = (path = "") => {
  if (!telegramEnv.websiteBaseUrl) return "";
  try {
    const url = new URL(path, telegramEnv.websiteBaseUrl.replace(/\/+$/, "/"));
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return "";
    return url.toString();
  } catch {
    return "";
  }
};

const siteButton = (text, path = "") => {
  const url = siteUrl(path);
  return url ? { text, url } : null;
};

const rows = (source = []) =>
  source.map((row) => row.filter(Boolean)).filter((row) => row.length);

const inlineKeyboard = (source = []) => {
  const inline_keyboard = rows(source);
  return inline_keyboard.length ? { inline_keyboard } : undefined;
};

const formatMoney = (value) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0 ₴";
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
};

const formatDate = (value) => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toLocaleDateString("uk-UA");
};

export const TELEGRAM_BOT_COMMANDS = [
  { command: "menu", description: "Відкрити меню" },
  { command: "profile", description: "Профіль" },
  { command: "orders", description: "Останні замовлення" },
  { command: "discount", description: "Знижка і бонуси" },
  { command: "favorites", description: "Обране" },
  { command: "addresses", description: "Адреси доставки" },
  { command: "notifications", description: "Сповіщення" },
  { command: "site", description: "Сайт і кабінет" },
  { command: "support", description: "Підтримка" },
  { command: "help", description: "Допомога" },
];

const mainKeyboard = () =>
  inlineKeyboard([
    [
      { text: "👤 Профіль", callback_data: "nav:profile" },
      { text: "📦 Замовлення", callback_data: "nav:orders" },
    ],
    [
      { text: "💳 Знижка", callback_data: "nav:discount" },
      { text: "⭐ Обране", callback_data: "nav:favorites" },
    ],
    [
      { text: "📍 Адреси", callback_data: "nav:addresses" },
      { text: "🔔 Сповіщення", callback_data: "nav:notifications" },
    ],
    [
      { text: "🛟 Підтримка", callback_data: "nav:support" },
      siteButton("🌐 Сайт", "/"),
    ],
  ]);

const authKeyboard = () => ({
  keyboard: [
    [
      {
        text: "📱 Поділитися номером",
        request_contact: true,
      },
    ],
  ],
  resize_keyboard: true,
  one_time_keyboard: true,
});

const removeKeyboard = () => ({ remove_keyboard: true });

const sendBindSuccess = async ({ chatId }) => {
  await sendTelegramMessage({
    chatId,
    text: "Telegram успішно підключено до акаунта.",
    replyMarkup: removeKeyboard(),
  });

  return sendTelegramMessage({
    chatId,
    text: "Тепер ви можете отримувати сповіщення і користуватися кабінетом у боті.",
    replyMarkup: mainKeyboard(),
  });
};

const openSiteKeyboard = () =>
  inlineKeyboard([
    [siteButton("👤 Кабінет", "/account"), siteButton("🛒 Кошик", "/shopping-cart")],
    [siteButton("📦 Мої замовлення", "/account?tab=orders"), siteButton("💳 Бонуси", "/account?tab=loyalty")],
    [siteButton("⭐ Wishlist", "/account?tab=wishlist"), siteButton("📍 Адреси", "/account?tab=addresses")],
    [siteButton("🌐 Головна", "/")],
  ]);

const requireBinding = async (from, chatId) => {
  const binding = await getActiveBindingByTelegramUserId(from?.id);
  if (!binding) {
    await sendTelegramMessage({
      chatId,
      text:
        "Telegram ще не підключено до акаунта.\n\nНатисніть “📱 Поділитися номером”, щоб привʼязати цей Telegram.",
      replyMarkup: authKeyboard(),
    });
    return null;
  }
  return binding;
};

const renderFallbackUnavailable = (section) =>
  `${section} зараз недоступний у боті. Спробуйте відкрити сайт.`;

const sendMenu = async ({ chatId, from }) => {
  const binding = await getActiveBindingByTelegramUserId(from?.id);
  if (!binding) {
    return sendTelegramMessage({
      chatId,
      text:
        "Вітаю. Я бот меблевого магазину.\n\nЩоб підключити Telegram до акаунта, відкрийте профіль на сайті, натисніть “Підключити Telegram”, потім тут натисніть Start і поділіться номером.",
      replyMarkup: authKeyboard(),
    });
  }

  return sendTelegramMessage({
    chatId,
    text: [
      `<b>Меню MebliHub</b>`,
      binding.userPreview?.name ? `Акаунт: ${html(binding.userPreview.name)}` : "",
      "Оберіть дію нижче.",
    ]
      .filter(Boolean)
      .join("\n"),
    replyMarkup: mainKeyboard(),
  });
};

const sendStart = async ({ chatId, from, text }) => {
  const startArg = String(text || "").split(/\s+/)[1] || "";
  if (startArg) {
    return requestContactForBindCode({ chatId, from, code: startArg });
  }

  return sendMenu({ chatId, from });
};

const requestContactForBindCode = async ({ chatId, from, code }) => {
  try {
    await prepareBindCodeConfirmation({
      code,
      from,
      chat: { id: chatId },
    });
    rememberPendingBindCode({ chatId, from, code });
    return sendTelegramMessage({
      chatId,
      text:
        "Заявку з сайту знайдено.\n\nНатисніть “📱 Поділитися номером”, щоб підтвердити цей Telegram. До акаунта буде привʼязано номер, який ви надішлете з Telegram.",
      replyMarkup: authKeyboard(),
    });
  } catch (error) {
    const messages = {
      BIND_CODE_NOT_FOUND: "Код не знайдено. Відкрийте нове посилання з профілю на сайті.",
      BIND_CODE_EXPIRED: "Код прострочений. Створіть новий запит у профілі на сайті.",
      INVALID_BIND_CODE: "Некоректне посилання. Створіть новий запит у профілі на сайті.",
    };
    return sendTelegramMessage({
      chatId,
      text: messages[error.code] || "Не вдалося перевірити посилання. Створіть новий запит у профілі на сайті.",
      replyMarkup: authKeyboard(),
    });
  }
};

const sendBindContact = async ({ chatId, from, contact }) => {
  const contactUserId = String(contact?.user_id || "");
  if (!contactUserId || contactUserId !== String(from?.id || "")) {
    return sendTelegramMessage({
      chatId,
      text: "Потрібен саме ваш Telegram-контакт. Натисніть “📱 Поділитися номером” у кнопці нижче.",
      replyMarkup: authKeyboard(),
    });
  }

  const pendingCode = takePendingBindCode({ chatId, from });
  if (pendingCode) {
    try {
      await confirmBindCodeWithContact({
        code: pendingCode,
        phone: contact.phone_number,
        from,
        chat: { id: chatId },
      });
      return sendBindSuccess({ chatId });
    } catch (error) {
      const messages = {
        BIND_CODE_NOT_FOUND: "Код не знайдено. Відкрийте нове посилання з профілю на сайті.",
        BIND_CODE_EXPIRED: "Код прострочений. Створіть новий запит у профілі на сайті.",
        TELEGRAM_ALREADY_BOUND: "Цей Telegram уже привʼязаний до іншого акаунта.",
        WEBSITE_USER_ALREADY_BOUND: "Цей акаунт уже має привʼязаний інший Telegram.",
        PHONE_ALREADY_USED: "Цей номер уже використовується в іншому акаунті на сайті.",
        WEBSITE_PHONE_UPDATE_FAILED: "Не вдалося оновити номер у профілі на сайті. Спробуйте ще раз.",
        WEBSITE_API_UNAVAILABLE: "Зараз не можу оновити номер на сайті. Спробуйте ще раз пізніше.",
        TOO_MANY_CODE_ATTEMPTS: "Забагато спроб. Створіть новий запит у профілі на сайті.",
      };
      return sendTelegramMessage({
        chatId,
        text: messages[error.code] || "Не вдалося підключити Telegram. Створіть новий запит у профілі на сайті.",
        replyMarkup: authKeyboard(),
      });
    }
  }

  try {
    await confirmBindByPhoneContact({
      phone: contact.phone_number,
      from,
      chat: { id: chatId },
    });
    return sendBindSuccess({ chatId });
  } catch (error) {
    const messages = {
      TELEGRAM_PHONE_NOT_FOUND:
        "Не знайшов акаунт із таким телефоном. Перевірте номер у профілі на сайті або увійдіть на сайт і натисніть “Підключити Telegram”.",
      WEBSITE_API_UNAVAILABLE:
        "Зараз не можу перевірити номер на сайті. Спробуйте ще раз пізніше.",
      TELEGRAM_ALREADY_BOUND: "Цей Telegram уже привʼязаний до іншого акаунта.",
      WEBSITE_USER_ALREADY_BOUND: "Цей акаунт уже має привʼязаний інший Telegram.",
    };
    return sendTelegramMessage({
      chatId,
      text: messages[error.code] || "Не вдалося підключити Telegram за номером. Спробуйте ще раз.",
      replyMarkup: authKeyboard(),
    });
  }
};

const sendHelp = ({ chatId }) =>
  sendTelegramMessage({
    chatId,
    text: [
      "<b>Команди</b>",
      "/start - старт і перевірка привʼязки",
      "/menu - головне меню",
      "/profile - коротка інформація профілю",
      "/orders - останні замовлення",
      "/discount - дисконтна картка",
      "/favorites - обране",
      "/addresses - адреси доставки",
      "/notifications - налаштування сповіщень",
      "/site - посилання на сайт і кабінет",
      "/support - підтримка",
      "/login - як підтвердити вхід на сайт",
      "/unlink - відвʼязати Telegram",
    ].join("\n"),
  });

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
      profile.cardNumber ? `Картка: ${html(profile.cardNumber)}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    replyMarkup: inlineKeyboard([[siteButton("Відкрити кабінет", "/account")]]),
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
    });
  }

  const text = orders
    .slice(0, 5)
    .map((order) =>
      [
        `<b>Замовлення ${html(order.number || order.id || "")}</b>`,
        order.status ? `Статус: ${html(order.status)}` : "",
        order.createdAt ? `Дата: ${html(formatDate(order.createdAt))}` : "",
        order.total !== undefined ? `Сума: ${html(formatMoney(order.total))}` : "",
        Array.isArray(order.items) && order.items.length
          ? `Склад: ${html(order.items.map((item) => item.name || item.title).filter(Boolean).slice(0, 3).join(", "))}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");

  return sendTelegramMessage({
    chatId,
    text,
    replyMarkup: inlineKeyboard([[siteButton("Відкрити всі замовлення", "/account?tab=orders")]]),
  });
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
    });
  }

  return sendTelegramMessage({
    chatId,
    text: [
      "<b>Дисконтна картка</b>",
      discount.cardNumber ? `Номер: ${html(discount.cardNumber)}` : "",
      discount.percent !== undefined ? `Знижка: ${html(discount.percent)}%` : "",
      discount.tier ? `Рівень: ${html(discount.tier)}` : "",
      discount.bonusBalance !== undefined ? `Бонуси: ${html(discount.bonusBalance)}` : "",
      discount.history?.length ? `Останнє використання: ${html(discount.history[0].date || "")}` : "",
      discount.qrUrl ? "QR доступний у веб-версії кабінету." : "",
    ]
      .filter(Boolean)
      .join("\n") || "Дисконтна картка ще не активна.",
    replyMarkup: inlineKeyboard([[siteButton("Відкрити бонуси", "/account?tab=loyalty")]]),
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
    });
  }

  const text = favorites
    .slice(0, 8)
    .map((item, index) => `${index + 1}. ${html(item.name || item.title || item.slug || item.id)}`)
    .join("\n");

  return sendTelegramMessage({
    chatId,
    text: `<b>Обране</b>\n${text}`,
    replyMarkup: inlineKeyboard([[siteButton("Відкрити wishlist", "/account?tab=wishlist")]]),
  });
};

const sendAddresses = async ({ chatId, from }) => {
  const binding = await requireBinding(from, chatId);
  if (!binding) return;

  const response = await webAppClient.getAddresses(binding.websiteUserId);
  const addresses = response.data?.addresses || response.data?.items || [];
  if (!response.ok || !addresses.length) {
    return sendTelegramMessage({
      chatId,
      text: response.ok ? "Адрес доставки поки немає." : renderFallbackUnavailable("Адреси доставки"),
      replyMarkup: inlineKeyboard([[siteButton("Керувати адресами", "/account?tab=addresses")]]),
    });
  }

  const text = addresses
    .slice(0, 5)
    .map((address, index) =>
      [
        `${index + 1}. ${address.isPrimary ? "<b>Основна адреса</b>" : "<b>Адреса</b>"}`,
        address.label ? `Назва: ${html(address.label)}` : "",
        address.city ? `Місто: ${html(address.city)}` : "",
        address.addressLine ? `Адреса: ${html(address.addressLine)}` : "",
        address.comment ? `Коментар: ${html(address.comment)}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");

  return sendTelegramMessage({
    chatId,
    text: `<b>Адреси доставки</b>\n${text}`,
    replyMarkup: inlineKeyboard([[siteButton("Керувати адресами", "/account?tab=addresses")]]),
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
    text: "<b>🔔 Налаштування сповіщень</b>",
    replyMarkup: {
      inline_keyboard: [
        ...Object.entries(preferenceLabels).map(([key, label]) => [
          {
            text: `${prefs[key] === false ? "🔕 Вимкнено" : "✅ Увімкнено"} · ${label}`,
            callback_data: `pref_toggle:${key}`,
          },
        ]),
        [{ text: "⬅️ Меню", callback_data: "nav:menu" }],
      ],
    },
  });
};

const sendSiteLinks = ({ chatId }) =>
  sendTelegramMessage({
    chatId,
    text: siteUrl()
      ? "Швидкі посилання на сайт і особистий кабінет."
      : "Посилання на сайт недоступні, бо WEBSITE_BASE_URL зараз не налаштований для публічного домену.",
    replyMarkup: openSiteKeyboard(),
  });

const sendSupport = ({ chatId }) =>
  sendTelegramMessage({
    chatId,
    text:
      "Підтримка доступна на сайті через чат. Відкрийте сайт і натисніть кнопку чату внизу сторінки.\n\nТакож можете переглянути контакти магазину.",
    replyMarkup: inlineKeyboard([
      [siteButton("Відкрити сайт", "/"), siteButton("Контакти", "/contacts")],
      [siteButton("Особистий кабінет", "/account")],
    ]),
  });

const sendLoginHelp = async ({ chatId, from }) => {
  const binding = await requireBinding(from, chatId);
  if (!binding) return;

  return sendTelegramMessage({
    chatId,
    text:
      "Щоб увійти через Telegram, виберіть на сайті “Увійти через код у Telegram”. Тут зʼявиться кнопка “Підтвердити вхід”.",
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
  "/menu": sendMenu,
  "/profile": sendProfile,
  "/orders": sendOrders,
  "/discount": sendDiscount,
  "/bonus": sendDiscount,
  "/favorites": sendFavorites,
  "/addresses": sendAddresses,
  "/notifications": sendNotifications,
  "/site": sendSiteLinks,
  "/support": sendSupport,
  "/login": sendLoginHelp,
  "/unlink": sendUnlink,
};

const textAliases = [
  [/^(меню|menu)$/i, "/menu"],
  [/^(профіль|profile|кабінет)$/i, "/profile"],
  [/^(замовлення|orders)$/i, "/orders"],
  [/^(знижка|бонуси|discount|bonus)$/i, "/discount"],
  [/^(обране|wishlist|favorites)$/i, "/favorites"],
  [/^(адреси|addresses)$/i, "/addresses"],
  [/^(сповіщення|notifications)$/i, "/notifications"],
  [/^(сайт|site)$/i, "/site"],
  [/^(підтримка|support)$/i, "/support"],
];

const handleMessage = async (message) => {
  const text = String(message?.text || "").trim();
  const chatId = String(message?.chat?.id || "");
  const from = message?.from || {};
  if (!chatId) return;

  if (message?.contact) {
    return sendBindContact({ chatId, from, contact: message.contact });
  }

  if (!text) return;

  const command = text.startsWith("/") ? text.split(/\s+/)[0].split("@")[0] : "";
  if (command && commandHandlers[command]) {
    return commandHandlers[command]({ chatId, from, text });
  }

  const alias = textAliases.find(([pattern]) => pattern.test(text));
  if (alias) {
    return commandHandlers[alias[1]]({ chatId, from, text });
  }

  if (/^\d{4,8}$/.test(text)) {
    return requestContactForBindCode({ chatId, from, code: text });
  }

  return sendTelegramMessage({
    chatId,
    text: "Не розумію команду. Натисніть /help, щоб побачити можливості.",
  });
};

const handleCallbackQuery = async (callbackQuery) => {
  const data = String(callbackQuery?.data || "");
  const from = callbackQuery?.from || {};
  const chatId = String(callbackQuery?.message?.chat?.id || from?.id || "");

  if (data.startsWith("nav:")) {
    await answerTelegramCallback({ callbackQueryId: callbackQuery.id });
    const section = data.slice(4);
    if (section === "menu") return sendMenu({ chatId, from });
    if (section === "profile") return sendProfile({ chatId, from });
    if (section === "orders") return sendOrders({ chatId, from });
    if (section === "discount") return sendDiscount({ chatId, from });
    if (section === "favorites") return sendFavorites({ chatId, from });
    if (section === "addresses") return sendAddresses({ chatId, from });
    if (section === "notifications") return sendNotifications({ chatId, from });
    if (section === "support") return sendSupport({ chatId, from });
    if (section === "site") return sendSiteLinks({ chatId });
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
      return null;
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
        text: "Сталася помилка. Спробуйте ще раз або відкрийте меню команд.",
      }).catch(() => null);
    }
    await writeAuditLog({
      eventType: "bot.update_error",
      telegramUserId: String(update?.message?.from?.id || update?.callback_query?.from?.id || ""),
      chatId: String(chatId || ""),
      ok: false,
      reason: error.message,
    });
    return { ok: false, code: error?.code || "BOT_UPDATE_FAILED" };
  }

  return { ok: true, skipped: true };
};
