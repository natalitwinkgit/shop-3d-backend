import mongoose from "mongoose";

const telegramAuditLogSchema = new mongoose.Schema(
  {
    eventType: { type: String, required: true, index: true, trim: true },
    websiteUserId: { type: String, default: "", index: true, trim: true },
    telegramUserId: { type: String, default: "", index: true, trim: true },
    chatId: { type: String, default: "", trim: true },
    requestId: { type: String, default: "", index: true, trim: true },
    ok: { type: Boolean, default: true, index: true },
    reason: { type: String, default: "", trim: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true }
);

telegramAuditLogSchema.index({ createdAt: -1 });

const TelegramAuditLog =
  mongoose.models.TelegramAuditLog ||
  mongoose.model("TelegramAuditLog", telegramAuditLogSchema, "telegram_audit_logs");

export default TelegramAuditLog;
