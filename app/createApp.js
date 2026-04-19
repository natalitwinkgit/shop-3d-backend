import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import http from "http";
import mongoose from "mongoose";
import path from "path";

import { corsOptions } from "../config/cors.js";
import { env } from "../config/env.js";
import { createSocketServer } from "../sockets/chatSocket.js";
import {
  openApiDocument,
  swaggerDocsSecurityHeaders,
  swaggerUi,
  swaggerUiOptions,
} from "../docs/swagger/config.js";
import { apiNotFoundHandler } from "./middleware/apiNotFound.js";
import { globalErrorHandler } from "./middleware/globalErrorHandler.js";
import { sanitizeRequestBody } from "./middleware/inputSecurity.js";
import { attachRequestContext } from "./middleware/requestContext.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { registerApiRoutes } from "./registerApiRoutes.js";
import { createRateLimit } from "../middleware/rateLimitMiddleware.js";

export const createApp = () => {
  const app = express();
  app.set("trust proxy", 1);
  const globalApiRateLimit = createRateLimit({
    windowMs: 60 * 1000,
    max: 120,
    message: "Too many API requests. Please retry later.",
    skip: (req) => req.originalUrl.startsWith("/api/i18n-missing"),
  });

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: env.cspEnabled
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:", "https:"],
              connectSrc: ["'self'", "https:", "wss:", "ws:"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
            },
          }
        : false,
    })
  );

  app.use(cors(corsOptions));
  app.options("*", cors(corsOptions));

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(attachRequestContext);
  app.use(sanitizeRequestBody);

  if (process.env.NODE_ENV !== "production") {
    app.use(requestLogger);
  }

  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
  app.get("/api-docs.json", swaggerDocsSecurityHeaders, (_req, res) => {
    res.json(openApiDocument);
  });
  app.use(
    "/api-docs",
    swaggerDocsSecurityHeaders,
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, swaggerUiOptions)
  );

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

  app.use("/api", globalApiRateLimit);
  registerApiRoutes(app);
  app.use("/api", apiNotFoundHandler);
  app.use(globalErrorHandler);

  const server = http.createServer(app);
  const io = createSocketServer(server);

  return { app, server, io };
};
