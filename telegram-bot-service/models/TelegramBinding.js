import mongoose from "mongoose";

const notificationPreferencesSchema = new mongoose.Schema(
  {
    orderStatus: { type: Boolean, default: true },
    promotions: { type: Boolean, default: true },
    personalDiscounts: { type: Boolean, default: true },
    abandonedCart: { type: Boolean, default: true },
    backInStock: { type: Boolean, default: true },
    priceDrop: { type: Boolean, default: true },
    unfinishedOrder: { type: Boolean, default: true },
    service: { type: Boolean, default: true },
  },
  { _id: false }
);

const userPreviewSchema = new mongoose.Schema(
  {
    email: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    name: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const telegramBindingSchema = new mongoose.Schema(
  {
    websiteUserId: { type: String, required: true, index: true, trim: true },
    telegramUserId: { type: String, required: true, index: true, trim: true },
    chatId: { type: String, required: true, index: true, trim: true },
    username: { type: String, default: "", trim: true },
    firstName: { type: String, default: "", trim: true },
    lastName: { type: String, default: "", trim: true },
    languageCode: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["active", "unlinked", "blocked"],
      default: "active",
      index: true,
    },
    userPreview: { type: userPreviewSchema, default: () => ({}) },
    notificationPreferences: {
      type: notificationPreferencesSchema,
      default: () => ({}),
    },
    linkedAt: { type: Date, default: Date.now },
    unlinkedAt: { type: Date, default: null },
    blockedAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

telegramBindingSchema.index({ websiteUserId: 1, status: 1 });
telegramBindingSchema.index({ telegramUserId: 1, status: 1 });
telegramBindingSchema.index(
  { websiteUserId: 1 },
  { unique: true, partialFilterExpression: { status: "active" } }
);
telegramBindingSchema.index(
  { telegramUserId: 1 },
  { unique: true, partialFilterExpression: { status: "active" } }
);

const TelegramBinding =
  mongoose.models.TelegramBinding ||
  mongoose.model("TelegramBinding", telegramBindingSchema, "telegram_bindings");

export default TelegramBinding;
