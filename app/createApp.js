import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import http from "http";
import mongoose from "mongoose";
import path from "path";

import { corsOptions } from "../config/cors.js";
import { createSocketServer } from "../sockets/chatSocket.js";
import { apiNotFoundHandler } from "./middleware/apiNotFound.js";
import { globalErrorHandler } from "./middleware/globalErrorHandler.js";
import { attachRequestContext } from "./middleware/requestContext.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { registerApiRoutes } from "./registerApiRoutes.js";

export const createApp = () => {
  const app = express();
  app.set("trust proxy", 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  app.use(cors(corsOptions));
  app.options("*", cors(corsOptions));

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(attachRequestContext);

  if (process.env.NODE_ENV !== "production") {
    app.use(requestLogger);
  }

  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });
  app.get("/api/ready", (_req, res) => {
    const mongoReady = mongoose.connection.readyState === 1;
    res.status(mongoReady ? 200 : 503).json({
      ok: mongoReady,
      mongo: mongoReady ? "connected" : "disconnected",
      ts: Date.now(),
    });
  });

  registerApiRoutes(app);
  app.use("/api", apiNotFoundHandler);
  app.use(globalErrorHandler);

  const server = http.createServer(app);
  const io = createSocketServer(server);

  return { app, server, io };
};
