// server/index.js  ✅ UPDATED FULL CODE (+ /api/inventory routes)
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

// ✅ NEW: inventory routes (stock by locations)
import inventoryRoutes from "./routes/inventoryRoutes.js";

// ✅ model for saving socket messages
import Message from "./models/Message.js";

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
// CORS
// -----------------------
const allowedOrigins = String(process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
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

// ✅ NEW: inventory before /api 404
// фронт викликає: GET /api/inventory/product/:productId
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
// Socket.io
// -----------------------
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

io.on("connection", (socket) => {
  // client: socket.emit("join", { userId })
  socket.on("join", ({ userId }) => {
    if (userId) socket.join(String(userId));
  });

  // client: socket.emit("message:send", { to, sender, receiver, text, guestName? })
  socket.on("message:send", async (payload) => {
    try {
      const to = payload?.to ? String(payload.to) : "";
      const sender = payload?.sender ? String(payload.sender) : "";
      const receiver = payload?.receiver ? String(payload.receiver) : to;
      const text = String(payload?.text || "").trim();

      if (!to || !sender || !receiver || !text) return;

      // ✅ SERVER decides guest by sender
      const isGuest = sender.startsWith("guest_");
      const guestName = isGuest ? String(payload?.guestName || "").trim() : "";

      const doc = await Message.create({
        sender,
        receiver,
        text,
        isGuest,
        guestName,
        isRead: false,
      });

      const msg = doc.toObject();

      // ✅ realtime both sides
      io.to(String(receiver)).emit("message:new", msg);
      io.to(String(sender)).emit("message:new", msg);
    } catch (e) {
      console.error("[socket message:send] error:", e);
    }
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

    server.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
      console.log("✅ Allowed origins:", allowedOrigins);
    });
  } catch (e) {
    console.error("❌ Mongo connect error:", e);
    process.exit(1);
  }
}

start();
