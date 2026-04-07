import mongoose from "mongoose";

import "../config/env.js";
import { createApp } from "../app/createApp.js";
import { allowedOrigins, vercelPreviewRegex } from "../config/cors.js";
import { env } from "../config/env.js";
import { ensureAiAdminUser } from "../services/aiAdminService.js";
import { ensureSeedSuperadminUser } from "../services/userProfileService.js";

export const startServer = async () => {
  const { server } = createApp();

  if (!env.mongoUri) {
    console.error("❌ MONGO_URI is missing");
    process.exit(1);
  }

  try {
    await mongoose.connect(env.mongoUri);
    console.log("✅ MongoDB connected");

    try {
      const superadminUser = await ensureSeedSuperadminUser();
      if (superadminUser) {
        console.log(
          "✅ Superadmin ready:",
          String(superadminUser.email || superadminUser._id)
        );
      }
    } catch (bootstrapError) {
      console.error("❌ Superadmin bootstrap error:", bootstrapError);
    }

    const shouldBootstrapAiAdmin =
      Boolean(String(process.env.AI_ADMIN_EMAIL || "").trim()) ||
      Boolean(String(process.env.AI_ADMIN_NAME || "").trim()) ||
      Boolean(String(process.env.AI_ADMIN_PASSWORD || "").trim()) ||
      Boolean(String(process.env.OPENAI_API_KEY || "").trim()) ||
      Boolean(String(process.env.GEMINI_API_KEY || "").trim());

    if (shouldBootstrapAiAdmin) {
      try {
        const aiAdminUser = await ensureAiAdminUser();
        console.log("✅ AI admin ready:", String(aiAdminUser.email || aiAdminUser._id));
      } catch (bootstrapError) {
        console.error("❌ AI admin bootstrap error:", bootstrapError);
      }
    }

    server.listen(env.port, () => {
      console.log(`✅ Server running on http://localhost:${env.port}`);
      console.log("✅ Allowed origins:", allowedOrigins);
      console.log("✅ Vercel preview regex:", String(vercelPreviewRegex));
    });
  } catch (error) {
    console.error("❌ Mongo connect error:", error);
    process.exit(1);
  }
};
