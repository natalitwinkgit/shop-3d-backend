import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    sender: { type: String, required: true, index: true },   // userId або guest_...
    receiver: { type: String, required: true, index: true }, // userId (admin/user)
    text: { type: String, required: true, trim: true },
    isGuest: { type: Boolean, default: false },
    guestName: { type: String, default: "" }, // ✅ тільки для гостей (опційно)
    isRead: { type: Boolean, default: false },
    deliveredAt: { type: Date, default: null },
    readAt: { type: Date, default: null },
    source: {
      type: String,
      enum: ["human", "ai_admin"],
      default: "human",
      index: true,
    },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

messageSchema.index({ sender: 1, receiver: 1, createdAt: 1 });
messageSchema.index({ receiver: 1, isRead: 1, deliveredAt: 1, createdAt: -1 });

export default mongoose.models.Message || mongoose.model("Message", messageSchema);
