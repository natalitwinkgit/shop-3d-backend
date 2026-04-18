import { env } from "../config/env.js";
import User from "../models/userModel.js";
import Order from "../models/Order.js";
import { logger } from "../app/lib/logger.js";

let bot = null;
let botInfo = null;
let started = false;

export const getBot = () => bot;
export const isBotStarted = () => started;

export const getBotUsername = () => {
  return (botInfo && botInfo.username) || env.telegramBotUsername || "";
};

export const startTelegramBot = async () => {
  if (!env.telegramBotEnabled) {
    logger.info("Telegram bot disabled by configuration");
    return;
  }
  if (!env.telegramBotToken) {
    logger.warn("TELEGRAM_BOT_TOKEN is not configured, bot will not start");
    return;
  }

  try {
    const { Telegraf } = await import("telegraf");
    bot = new Telegraf(env.telegramBotToken);

    // /start handler — deep link payload handling
    bot.start(async (ctx) => {
      try {
        const payload = ctx.startPayload || (ctx.message && ctx.message.text ? String(ctx.message.text || "").split(" ")[1] : "");
        if (!payload) {
          return ctx.reply("Ласкаво просимо! Щоб прив'язати акаунт, використайте deep-link з сайту.");
        }
        const token = String(payload || "").trim();
        if (!token) {
          return ctx.reply("Неправильне посилання для прив'язки.");
        }

        const user = await User.findOne({ tgLinkToken: token, tgLinkTokenExp: { $gt: new Date() } });
        if (!user) {
          return ctx.reply("Посилання не дійсне або термін дії минув.");
        }

        user.telegramId = String(ctx.from?.id || "");
        user.tgLinkToken = null;
        user.tgLinkTokenExp = null;
        await user.save();

        await ctx.reply("Акаунт успішно прив'язано. Ви тепер отримуватимете сповіщення.");
      } catch (err) {
        logger.error("Telegram /start handler error", {}, err);
        try {
          await ctx.reply("Сталася помилка при прив'язці акаунта. Спробуйте пізніше.");
        } catch (ignore) {}
      }
    });

    // /status handler — show last order status
    bot.command("status", async (ctx) => {
      try {
        const tid = String(ctx.from?.id || "");
        if (!tid) return ctx.reply("Не вдалося визначити ваш Telegram ID.");

        const user = await User.findOne({ telegramId: tid });
        if (!user) return ctx.reply("Ваш акаунт не прив'язаний до цього бота.");

        const lastOrder = await Order.findOne({ user: user._id }).sort({ createdAt: -1 });
        if (!lastOrder) return ctx.reply("Немає знайдених замовлень для вашого акаунта.");

        const reply = `Останнє замовлення: #${String(lastOrder._id)}\nСтатус: ${lastOrder.status}`;
        return ctx.reply(reply);
      } catch (err) {
        logger.error("Telegram /status handler error", {}, err);
        try { await ctx.reply("Не вдалося отримати статус замовлення. Спробуйте пізніше."); } catch (ignore) {}
      }
    });

    await bot.launch();
    botInfo = await bot.telegram.getMe();
    started = true;
    logger.info("Telegram bot started", { username: botInfo?.username });
  } catch (error) {
    logger.error("Failed to start Telegram bot", {}, error);
  }
};

export const sendMessageToTelegramId = async (telegramId, text, extra = {}) => {
  if (!started || !bot) {
    logger.warn("Attempted to send telegram message while bot is not started");
    return { sent: false, reason: "BOT_NOT_STARTED" };
  }
  try {
    await bot.telegram.sendMessage(String(telegramId), String(text), extra);
    return { sent: true };
  } catch (error) {
    logger.error("Failed to send telegram message", { telegramId }, error);
    return { sent: false, reason: String(error?.message || "send_error") };
  }
};

export default {
  startTelegramBot,
  getBot,
  getBotUsername,
  sendMessageToTelegramId,
  isBotStarted,
};
