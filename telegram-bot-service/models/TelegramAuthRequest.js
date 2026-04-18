import mongoose from "mongoose";

const telegramAuthRequestSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["bind", "login", "recovery"],
      required: true,
      index: true,
    },
    websiteUserId: { type: String, required: true, index: true, trim: true },
    requestTokenHash: { type: String, default: "", index: true, trim: true },
    codeHash: { type: String, default: "", index: true, trim: true },
    exchangeTokenHash: { type: String, default: "", index: true, trim: true },
    telegramUserId: { type: String, default: "", index: true, trim: true },
    chatId: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["pending", "confirmed", "redeemed", "expired", "cancelled"],
      default: "pending",
      index: true,
    },
    attemptCount: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    expiresAt: { type: Date, required: true, index: true },
    confirmedAt: { type: Date, default: null },
    redeemedAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true }
);

telegramAuthRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });
telegramAuthRequestSchema.index({ websiteUserId: 1, kind: 1, status: 1, createdAt: -1 });

const TelegramAuthRequest =
  mongoose.models.TelegramAuthRequest ||
  mongoose.model(
    "TelegramAuthRequest",
    telegramAuthRequestSchema,
    "telegram_auth_requests"
  );

export default TelegramAuthRequest;
