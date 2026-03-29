// server/index.js  ✅ UPDATED FULL CODE (+ Vercel preview CORS)
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import http from "http";
import helmet from "helmet";
import { Server } from "socket.io";
import { fileURLToPath } from "url";

dotenv.config();

// Routes
import authRoutes from "./routes/authRoutes.js";
import likeRoutes from "./routes/likeRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import subCategoryRoutes from "./routes/subCategoryRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import translationRoutes from "./routes/translations.js";
import locationRoutes from "./routes/locationRoutes.js";
import specConfigRoutes from "./routes/specConfigRoutes.js";
import specTemplateRoutes from "./routes/specTemplateRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import heartbeatRoutes from "./routes/heartbeatRoutes.js";
import i18nMissingRoutes from "./routes/i18nMissingRoutes.js";

// ✅ inventory routes
import inventoryRoutes from "./routes/inventoryRoutes.js";

import { createChatMessage, registerChatEmitter } from "./services/chatMessageService.js";
import { ensureAiAdminUser } from "./services/aiAdminService.js";
import { ensureSeedSuperadminUser } from "./services/userProfileService.js";

// ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);

const server = http.createServer(app);

// -----------------------
// Security headers
// -----------------------
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// -----------------------
// ✅ CORS (supports Vercel preview domains)
// -----------------------
const parseList = (v) =>
  String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// ENV allowlist (через кому). Можеш покласти сюди prod домен(и)
const envAllowed = parseList(process.env.CLIENT_URL);

// Dev allowlist
const devAllowed = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:8080",
];

// ✅ твій прод домен на Vercel (можеш також додати в CLIENT_URL)
const vercelProd = "https://shop-3d-frontend-1222.vercel.app";

// ✅ preview домени Vercel твого проекту (строго під твій team)
const vercelPreviewRegex =
  /^https:\/\/shop-3d-frontend-1222-[a-z0-9-]+-nataliasumska95-1299s-projects\.vercel\.app$/i;

// (опційно) дозволити будь-який *.vercel.app — якщо не хочеш, прибери
// const anyVercelRegex = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

const allowedOrigins = Array.from(new Set([...envAllowed, ...devAllowed, vercelProd]));

const isAllowedOrigin = (origin) => {
  if (!origin) return true; // same-origin / server-to-server
  if (allowedOrigins.includes(origin)) return true;
  if (vercelPreviewRegex.test(origin)) return true;
  // if (anyVercelRegex.test(origin)) return true; // optional
  return false;
};

const corsOptions = {
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`), false);
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// -----------------------
// Parsers
// -----------------------
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// -----------------------
// Dev request log
// -----------------------
if (process.env.NODE_ENV !== "production") {
  app.use((req, res, next) => {
    if (!req.originalUrl.startsWith("/uploads")) {
      console.log(`[${req.method}] ${req.originalUrl}`);
    }
    next();
  });
}

// -----------------------
// Static uploads
// -----------------------
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// -----------------------
// Health
// -----------------------
app.get("/api/health", (req, res) => res.json({ ok: true, ts: Date.now() }));

// -----------------------
// API routes
// -----------------------
app.use("/api/auth", authRoutes);
app.use("/api/likes", likeRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/subcategories", subCategoryRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/translations", translationRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/spec-config", specConfigRoutes);
app.use("/api/spec-templates", specTemplateRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/chat", chatRoutes);

// ✅ inventory before /api 404
app.use("/api/inventory", inventoryRoutes);

// ✅ admin before /api 404
app.use("/api/admin", adminRoutes);

app.use("/api/users", userRoutes);
app.use("/api/heartbeat", heartbeatRoutes);
app.use("/api/i18n-missing", i18nMissingRoutes);

// -----------------------
// 404 for API
// -----------------------
app.use("/api", (req, res) => {
  res.status(404).json({ message: "API route not found", path: req.originalUrl });
});

// -----------------------
// Global error handler
// -----------------------
app.use((err, req, res, next) => {
  console.error("[SERVER ERROR]", err);

  const status = err?.statusCode || err?.status || 500;
  res.status(status).json({
    message: err?.message || "Server error",
    path: req.originalUrl,
    ...(process.env.NODE_ENV === "production" ? {} : { stack: err?.stack }),
  });
});

// -----------------------
// Socket.io  ✅ CORS same as Express
// -----------------------
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      if (isAllowedOrigin(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
  },
});

registerChatEmitter(io);

io.on("connection", (socket) => {
  const joinRoom = ({ userId, id, roomId }) => {
    const rooms = Array.from(
      new Set(
        [userId, id, roomId]
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )
    );

    for (const room of rooms) {
      socket.join(room);
    }
  };

  const handleSendMessage = async (payload) => {
    try {
      const sender = String(
        payload?.sender ??
          payload?.from ??
          payload?.senderId ??
          ""
      ).trim();
      const receiver = String(
        payload?.receiver ??
          payload?.to ??
          payload?.receiverId ??
          payload?.chatUserId ??
          ""
      ).trim();
      const text = String(payload?.text ?? payload?.message ?? "").trim();

      if (!sender || !receiver || !text) {
        console.warn("[socket message:send] skipped invalid payload", {
          hasSender: !!sender,
          hasReceiver: !!receiver,
          hasText: !!text,
        });
        return;
      }

      socket.join(sender);

      const isGuest = sender.startsWith("guest_");
      const guestName = isGuest
        ? String(payload?.guestName ?? payload?.senderName ?? payload?.name ?? "").trim()
        : "";

      await createChatMessage({
        sender,
        receiver,
        text,
        isGuest,
        guestName,
      });
    } catch (e) {
      console.error("[socket message:send] error:", e);
    }
  };

  socket.on("join", joinRoom);

  socket.on("join_chat", ({ userId, id, roomId }) => {
    joinRoom({ userId, id, roomId });
  });

  socket.on("message:send", async (payload) => {
    await handleSendMessage(payload);
  });

  socket.on("send_message", async (payload) => {
    await handleSendMessage(payload);
  });

  socket.on("disconnect", () => {});
});

// -----------------------
// Mongo connect + start
// -----------------------
const PORT = Number(process.env.PORT || 5000);

async function start() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("❌ MONGO_URI is missing");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
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

    server.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
      console.log("✅ Allowed origins:", allowedOrigins);
      console.log("✅ Vercel preview regex:", String(vercelPreviewRegex));
    });
  } catch (e) {
    console.error("❌ Mongo connect error:", e);
    process.exit(1);
  }
}

start();
