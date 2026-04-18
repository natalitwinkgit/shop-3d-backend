import mongoose from "mongoose";

const telegramNotificationLogSchema = new mongoose.Schema(
  {
    websiteUserId: { type: String, required: true, index: true, trim: true },
    telegramUserId: { type: String, default: "", index: true, trim: true },
    chatId: { type: String, default: "", trim: true },
    type: {
      type: String,
      enum: [
        "orderStatus",
        "promotions",
        "personalDiscounts",
        "abandonedCart",
        "backInStock",
        "priceDrop",
        "unfinishedOrder",
        "service",
      ],
      required: true,
      index: true,
    },
    title: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["sent", "skipped", "failed"],
      default: "sent",
      index: true,
    },
    reason: { type: String, default: "", trim: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

telegramNotificationLogSchema.index({ websiteUserId: 1, createdAt: -1 });

const TelegramNotificationLog =
  mongoose.models.TelegramNotificationLog ||
  mongoose.model(
    "TelegramNotificationLog",
    telegramNotificationLogSchema,
    "telegram_notification_logs"
  );

export default TelegramNotificationLog;
