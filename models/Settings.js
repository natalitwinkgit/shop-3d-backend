import mongoose from "mongoose";

const aiProviderSettingsSchema = new mongoose.Schema(
  {
    apiKeyEncrypted: { type: String, default: "" },
    apiKeyMask: { type: String, default: "" },
    model: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const settingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "global",
      unique: true,
      index: true,
      trim: true,
    },
    ai: {
      provider: {
        type: String,
        enum: ["", "gemini", "openai"],
        default: "",
      },
      gemini: {
        type: aiProviderSettingsSchema,
        default: () => ({}),
      },
      openai: {
        type: aiProviderSettingsSchema,
        default: () => ({}),
      },
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      updatedAt: {
        type: Date,
        default: null,
      },
    },
  },
  { timestamps: true }
);

const Settings =
  mongoose.models.Settings || mongoose.model("Settings", settingsSchema);

export default Settings;
