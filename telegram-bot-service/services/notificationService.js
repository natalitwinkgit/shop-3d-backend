import TelegramBinding from "../models/TelegramBinding.js";
import TelegramNotificationLog from "../models/TelegramNotificationLog.js";
import { safeSendTelegramMessage } from "../integrations/telegramApi.js";
import { createHttpError } from "../utils/httpError.js";
import { markBindingBlocked } from "./bindingService.js";

const TYPE_LABELS = {
  orderStatus: "Статус замовлення",
  promotions: "Акція",
  personalDiscounts: "Персональна знижка",
  abandonedCart: "Покинутий кошик",
  backInStock: "Знову в наявності",
  priceDrop: "Зміна ціни",
  unfinishedOrder: "Незавершене замовлення",
  service: "Сервісне повідомлення",
};

const TYPE_EMOJIS = {
  orderStatus: "📦",
  promotions: "🔥",
  personalDiscounts: "💎",
  abandonedCart: "🛒",
  backInStock: "✅",
  priceDrop: "💸",
  unfinishedOrder: "🧾",
  service: "🛋️",
};

const SUPPORTED_TYPES = new Set(Object.keys(TYPE_LABELS));

const statusLabels = {
  processing: "в обробці",
  confirmed: "підтверджено",
  shipped: "відправлено",
  delivered: "доставлено",
  cancelled: "скасовано",
};

const html = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const hasValue = (value) => value !== undefined && value !== null && String(value).trim() !== "";

const normalizeNotificationType = (type) => {
  const normalized = String(type || "service").trim();
  if (SUPPORTED_TYPES.has(normalized)) return normalized;
  throw createHttpError(400, "Unsupported notification type", "UNSUPPORTED_NOTIFICATION_TYPE");
};

const websiteButton = (url) =>
  url
    ? {
        inline_keyboard: [[{ text: "🌐 Відкрити сайт", url }]],
      }
    : undefined;

const brandTitle = (emoji, title) => `<b>${emoji} MebliHub · ${html(title)}</b>`;

const buildNotificationText = ({ type, title, message, payload = {} }) => {
  if (type === "orderStatus") {
    const orderNumber = payload.orderNumber || payload.orderId || "";
    const status = statusLabels[payload.status] || payload.status || "";
    return [
      brandTitle("📦", "оновлення замовлення"),
      hasValue(orderNumber) ? `🧾 Замовлення: ${html(orderNumber)}` : "",
      hasValue(status) ? `🧭 Статус: ${html(status)}` : "",
      hasValue(payload.total) ? `💰 Сума: ${html(payload.total)}` : "",
      message ? html(message) : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    brandTitle(TYPE_EMOJIS[type] || "🛋️", title || TYPE_LABELS[type] || "Повідомлення"),
    message ? html(message) : "",
  ]
    .filter(Boolean)
    .join("\n");
};

export const sendNotificationToUser = async ({
  websiteUserId,
  type = "service",
  title = "",
  message = "",
  payload = {},
  url = "",
}) => {
  const normalizedUserId = String(websiteUserId || "").trim();
  if (!normalizedUserId) {
    throw createHttpError(400, "websiteUserId is required", "WEBSITE_USER_ID_REQUIRED");
  }

  const notificationType = normalizeNotificationType(type);
  const binding = await TelegramBinding.findOne({ websiteUserId: normalizedUserId, status: "active" });
  if (!binding) {
    await TelegramNotificationLog.create({
      websiteUserId: normalizedUserId,
      type: notificationType,
      title,
      status: "skipped",
      reason: "telegram_not_linked",
      payload,
    });
    return { ok: false, status: "skipped", reason: "telegram_not_linked" };
  }

  if (binding.notificationPreferences?.[notificationType] === false) {
    await TelegramNotificationLog.create({
      websiteUserId: normalizedUserId,
      telegramUserId: binding.telegramUserId,
      chatId: binding.chatId,
      type: notificationType,
      title,
      status: "skipped",
      reason: "disabled_by_user",
      payload,
    });
    return { ok: false, status: "skipped", reason: "disabled_by_user" };
  }

  try {
    await safeSendTelegramMessage({
      chatId: binding.chatId,
      text: buildNotificationText({ type: notificationType, title, message, payload }),
      replyMarkup: websiteButton(url || payload.url),
    });

    await TelegramNotificationLog.create({
      websiteUserId: normalizedUserId,
      telegramUserId: binding.telegramUserId,
      chatId: binding.chatId,
      type: notificationType,
      title,
      status: "sent",
      payload,
      sentAt: new Date(),
    });

    return { ok: true, status: "sent" };
  } catch (error) {
    if (error.code === "TELEGRAM_CHAT_UNAVAILABLE") {
      await markBindingBlocked({
        chatId: binding.chatId,
        telegramUserId: binding.telegramUserId,
        reason: error.message,
      });
    }

    await TelegramNotificationLog.create({
      websiteUserId: normalizedUserId,
      telegramUserId: binding.telegramUserId,
      chatId: binding.chatId,
      type: notificationType,
      title,
      status: "failed",
      reason: error.message,
      payload,
    });

    return { ok: false, status: "failed", reason: error.message };
  }
};

export const sendCampaignNotification = async ({
  websiteUserIds = [],
  type = "promotions",
  title = "",
  message = "",
  payload = {},
  url = "",
}) => {
  const notificationType = normalizeNotificationType(type);
  const targetUserIds = websiteUserIds.map((id) => String(id || "").trim()).filter(Boolean);
  const bindings = targetUserIds.length
    ? await TelegramBinding.find({ websiteUserId: { $in: targetUserIds }, status: "active" })
    : await TelegramBinding.find({ status: "active" });

  const results = [];
  for (const binding of bindings) {
    results.push(
      await sendNotificationToUser({
        websiteUserId: binding.websiteUserId,
        type: notificationType,
        title,
        message,
        payload,
        url,
      })
    );
  }

  return {
    total: results.length,
    sent: results.filter((item) => item.status === "sent").length,
    skipped: results.filter((item) => item.status === "skipped").length,
    failed: results.filter((item) => item.status === "failed").length,
  };
};
