import TelegramBinding from "../models/TelegramBinding.js";
import TelegramNotificationLog from "../models/TelegramNotificationLog.js";
import { safeSendTelegramMessage } from "../integrations/telegramApi.js";
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

const statusLabels = {
  processing: "в обробці",
  confirmed: "підтверджено",
  shipped: "відправлено",
  delivered: "доставлено",
  cancelled: "скасовано",
};

const websiteButton = (url) =>
  url
    ? {
        inline_keyboard: [[{ text: "Відкрити сайт", url }]],
      }
    : undefined;

const buildNotificationText = ({ type, title, message, payload = {} }) => {
  if (type === "orderStatus") {
    const orderNumber = payload.orderNumber || payload.orderId || "";
    const status = statusLabels[payload.status] || payload.status || "";
    return [
      "<b>Оновлення замовлення</b>",
      orderNumber ? `Замовлення: ${orderNumber}` : "",
      status ? `Статус: ${status}` : "",
      payload.total ? `Сума: ${payload.total}` : "",
      message || "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [`<b>${title || TYPE_LABELS[type] || "Повідомлення"}</b>`, message || ""]
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
  const binding = await TelegramBinding.findOne({ websiteUserId, status: "active" });
  if (!binding) {
    await TelegramNotificationLog.create({
      websiteUserId,
      type,
      title,
      status: "skipped",
      reason: "telegram_not_linked",
      payload,
    });
    return { ok: false, status: "skipped", reason: "telegram_not_linked" };
  }

  if (binding.notificationPreferences?.[type] === false) {
    await TelegramNotificationLog.create({
      websiteUserId,
      telegramUserId: binding.telegramUserId,
      chatId: binding.chatId,
      type,
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
      text: buildNotificationText({ type, title, message, payload }),
      replyMarkup: websiteButton(url || payload.url),
    });

    await TelegramNotificationLog.create({
      websiteUserId,
      telegramUserId: binding.telegramUserId,
      chatId: binding.chatId,
      type,
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
      websiteUserId,
      telegramUserId: binding.telegramUserId,
      chatId: binding.chatId,
      type,
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
  const targetUserIds = websiteUserIds.map((id) => String(id || "").trim()).filter(Boolean);
  const bindings = targetUserIds.length
    ? await TelegramBinding.find({ websiteUserId: { $in: targetUserIds }, status: "active" })
    : await TelegramBinding.find({ status: "active" });

  const results = [];
  for (const binding of bindings) {
    results.push(
      await sendNotificationToUser({
        websiteUserId: binding.websiteUserId,
        type,
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
