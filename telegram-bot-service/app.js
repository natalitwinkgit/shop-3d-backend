import express from "express";
import helmet from "helmet";

import internalRoutes from "./routes/internalRoutes.js";
import telegramRoutes from "./routes/telegramRoutes.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";

export const createTelegramServiceApp = () => {
  const app = express();
  app.set("trust proxy", 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "telegram-bot-service", ts: Date.now() });
  });

  app.use("/telegram", telegramRoutes);
  app.use("/internal", internalRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
