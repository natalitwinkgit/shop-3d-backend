import mongoose from "mongoose";

const missingTranslationSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    page: { type: String, default: "", trim: true },
    sourceLang: { type: String, enum: ["ua", "en"], default: "ua" },
    sourceText: { type: String, default: "", trim: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ["pending", "resolved", "failed"],
      default: "pending",
      index: true,
    },
    occurrences: { type: Number, default: 1, min: 1 },
    translations: {
      ua: { type: String, default: "", trim: true },
      en: { type: String, default: "", trim: true },
    },
    provider: { type: String, default: "", trim: true },
    model: { type: String, default: "", trim: true },
    lastError: {
      message: { type: String, default: "", trim: true },
      statusCode: { type: Number, default: 0 },
      at: { type: Date, default: null },
    },
    lastRequestedAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default
  mongoose.models.MissingTranslation ||
  mongoose.model("MissingTranslation", missingTranslationSchema);
