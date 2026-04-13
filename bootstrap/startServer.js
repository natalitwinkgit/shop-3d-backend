import mongoose from "mongoose";

import "../config/env.js";
import { createApp } from "../app/createApp.js";
import { logger } from "../app/lib/logger.js";
import { allowedOrigins, vercelPreviewRegex } from "../config/cors.js";
import { env } from "../config/env.js";
import { ensureAiAdminUser } from "../services/aiAdminService.js";
import { ensureSeedSuperadminUser } from "../services/userProfileService.js";

export const startServer = async () => {
  const { server } = createApp();

  if (!env.mongoUri) {
    logger.error("MONGO_URI is missing");
    process.exit(1);
  }
  if (!env.jwtSecret) {
    logger.error("JWT_SECRET is missing");
    process.exit(1);
  }

  try {
    await mongoose.connect(env.mongoUri);
    logger.info("MongoDB connected");

    try {
      const superadminUser = await ensureSeedSuperadminUser();
      if (superadminUser) {
        logger.info("Superadmin ready", {
          account: String(superadminUser.email || superadminUser._id),
        });
      }
    } catch (bootstrapError) {
      logger.error("Superadmin bootstrap error", {}, bootstrapError);
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
        logger.info("AI admin ready", {
          account: String(aiAdminUser.email || aiAdminUser._id),
        });
      } catch (bootstrapError) {
        logger.error("AI admin bootstrap error", {}, bootstrapError);
      }
    }

    const httpServer = server.listen(env.port, () => {
      logger.info("Server started", { port: env.port });
      logger.info("Allowed origins configured", { allowedOrigins });
      logger.info("Vercel preview regex configured", {
        vercelPreviewRegex: String(vercelPreviewRegex),
      });
    });

    let isShuttingDown = false;
    const shutdown = async (signal) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      logger.warn("Shutdown signal received", { signal });
      httpServer.close(async () => {
        try {
          await mongoose.connection.close();
          logger.info("MongoDB connection closed");
          process.exit(0);
        } catch (closeError) {
          logger.error("Error while closing MongoDB connection", {}, closeError);
          process.exit(1);
        }
      });

      setTimeout(() => {
        logger.error("Forced shutdown after timeout");
        process.exit(1);
      }, 10000).unref();
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    process.on("unhandledRejection", (reason) => {
      logger.error("Unhandled Rejection", {}, reason);
    });
    process.on("uncaughtException", (error) => {
      logger.error("Uncaught Exception", {}, error);
    });
  } catch (error) {
    logger.error("Mongo connection error", {}, error);
    process.exit(1);
  }
};
