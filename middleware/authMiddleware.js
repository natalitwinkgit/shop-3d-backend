import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

const getTokenFromReq = (req) => {
  // 1) Authorization: Bearer <token>
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) return auth.split(" ")[1];

  // 2) Cookie fallback (підстав назву cookie якщо інша)
  // популярні варіанти: token / jwt
  const cookieToken = req.cookies?.token || req.cookies?.jwt || null;
  if (cookieToken) return cookieToken;

  return null;
};

export const protect = async (req, res, next) => {
  try {
    const token = getTokenFromReq(req);

    if (token) {
      console.log("[AUTH] Token found.");
    } else {
      console.warn("[AUTH WARNING] No token.");
      return res.status(401).json({ message: "Не авторизовано, токен відсутній" });
    }

    if (!process.env.JWT_SECRET) {
      console.error("[AUTH FATAL] JWT_SECRET missing");
      return res.status(500).json({ message: "JWT_SECRET не встановлено" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err?.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Токен прострочено" });
      }
      if (err?.name === "JsonWebTokenError") {
        return res.status(401).json({ message: "Токен недійсний" });
      }
      console.error("[AUTH FATAL] jwt.verify error:", err);
      return res.status(401).json({ message: "Не авторизовано" });
    }

    console.log(`[AUTH] Token verified. User ID: ${decoded.id}`);

    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      console.error("[AUTH ERROR] User not found.");
      return res.status(401).json({ message: "Не авторизовано, користувач не знайдений" });
    }

    if (user.isBlocked || user.status === "banned") {
      return res.status(403).json({ message: "Користувача заблоковано" });
    }

    const now = new Date();
    const lastSeenTs = new Date(user.lastSeen || 0).getTime();
    const shouldTouchPresence =
      !user.isOnline || !lastSeenTs || now.getTime() - lastSeenTs > 30 * 1000;

    if (shouldTouchPresence) {
      user.isOnline = true;
      user.presence = "online";
      user.lastSeen = now;
      user.lastActivityAt = now;
      await user.save();
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("[AUTH FATAL]", err);
    return res.status(500).json({ message: "Помилка авторизації" });
  }
};

export const admin = (req, res, next) => {
  if (req.user?.role === "admin") return next();
  return res.status(403).json({ message: "Доступ лише для адміністратора" });
};
