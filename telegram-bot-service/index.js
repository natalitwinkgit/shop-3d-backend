import http from "http";

import { createTelegramServiceApp } from "./app.js";
import { assertTelegramEnv, telegramEnv } from "./config/env.js";
import {
  connectTelegramDatabase,
  disconnectTelegramDatabase,
} from "./config/database.js";
import {
  deleteTelegramWebhook,
  setTelegramWebhook,
} from "./integrations/telegramApi.js";
import { startTelegramPolling, stopTelegramPolling } from "./polling.js";
import { logger } from "./utils/logger.js";

const start = async () => {
  assertTelegramEnv();
  await connectTelegramDatabase();

  const app = createTelegramServiceApp();
  const server = http.createServer(app);

  server.listen(telegramEnv.port, async () => {
    logger.info("Telegram bot service started", { port: telegramEnv.port });

    if (telegramEnv.publicWebhookUrl) {
      const webhookUrl = `${telegramEnv.publicWebhookUrl.replace(/\/+$/, "")}/telegram/webhook`;
      await setTelegramWebhook(webhookUrl);
      logger.info("Telegram webhook configured", { webhookUrl });
      return;
    }

    if (telegramEnv.usePolling) {
      await deleteTelegramWebhook().catch(() => null);
      startTelegramPolling().catch((error) => {
        logger.error("Telegram polling stopped with error", {}, error);
      });
    }
  });

  const shutdown = async (signal) => {
    logger.warn("Telegram service shutdown signal received", { signal });
    stopTelegramPolling();
    server.close(async () => {
      await disconnectTelegramDatabase().catch((error) => {
        logger.error("Telegram DB disconnect failed", {}, error);
      });
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => {
    logger.error("Telegram service unhandled rejection", {}, reason);
    shutdown("unhandledRejection");
  });
  process.on("uncaughtException", (error) => {
    logger.error("Telegram service uncaught exception", {}, error);
    shutdown("uncaughtException");
  });
};

start().catch((error) => {
  logger.error("Telegram service failed to start", {}, error);
  process.exit(1);
});
