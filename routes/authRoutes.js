import express from "express";
import { 
  registerUser, 
  loginUser, 
  getMe,
  updateMe,
  logoutUser,
  forgotPassword,    // Якщо є
  resetPassword      // Якщо є
} from "../controllers/authController.js";

import { protect } from "../middleware/authMiddleware.js";
import { createRateLimit } from "../middleware/rateLimitMiddleware.js";

const router = express.Router();

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const registerRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many registration attempts. Please try again later.",
});

const loginRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: "Too many login attempts. Please try again later.",
  keyGenerator: (req) => `${req.ip}:${normalizeEmail(req.body?.email) || "unknown"}`,
});

const forgotPasswordRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many password reset requests. Please try again later.",
  keyGenerator: (req) => `${req.ip}:${normalizeEmail(req.body?.email) || "unknown"}`,
});

const resetPasswordRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many password reset attempts. Please try again later.",
});

router.post("/register", registerRateLimit, registerUser);
router.post("/login", loginRateLimit, loginUser);
router.get("/me", protect, getMe);
router.patch("/me", protect, updateMe);
router.post("/logout", protect, logoutUser);

// Якщо є маршрути для скидання пароля
router.post("/forgot-password", forgotPasswordRateLimit, forgotPassword);
router.post("/reset-password", resetPasswordRateLimit, resetPassword);

// ❌ ВИДАЛИ АБО ЗАКОМЕНТУЙ РЯДКИ З getAdminDashboard
// router.get("/admin/dashboard", protect, protectAdmin, getAdminDashboard); <--- ЦЕ БУЛО ПРИЧИНОЮ ПОМИЛКИ

export default router;
