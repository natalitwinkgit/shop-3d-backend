import express from "express";
import { z } from "zod";
import { 
  registerUser, 
  loginUser, 
  getMe,
  updateMe,
  logoutUser,
  forgotPassword,    // Якщо є
  resetPassword      // Якщо є
} from "../controllers/authController.js";
import {
  deleteMyAvatar,
  getMyAddresses,
  setMyAddresses,
  updateMyAvatar,
} from "../controllers/accountProfileController.js";

import { protect } from "../middleware/authMiddleware.js";
import { createRateLimit } from "../middleware/rateLimitMiddleware.js";
import { validateZodBody } from "../app/middleware/validateZod.js";
import { avatarUploadFields } from "../services/accountProfileService.js";

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

const registerSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  phone: z.string().trim().min(6),
  password: z.string().min(6),
  confirmPassword: z.string().min(6).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email(),
});

router.post(
  "/register",
  validateZodBody(registerSchema),
  registerRateLimit,
  registerUser
);
router.post(
  "/login",
  validateZodBody(loginSchema),
  loginRateLimit,
  loginUser
);
router.get("/me", protect, getMe);
router.patch("/me", protect, updateMe);
router.get("/me/addresses", protect, getMyAddresses);
router.put("/me/addresses", protect, setMyAddresses);
router.patch("/me/addresses", protect, setMyAddresses);
router.patch("/me/avatar", protect, avatarUploadFields, updateMyAvatar);
router.delete("/me/avatar", protect, deleteMyAvatar);
router.post("/logout", protect, logoutUser);

// Якщо є маршрути для скидання пароля
router.post(
  "/forgot-password",
  validateZodBody(forgotPasswordSchema),
  forgotPasswordRateLimit,
  forgotPassword
);
router.post("/reset-password", resetPasswordRateLimit, resetPassword);

// ❌ ВИДАЛИ АБО ЗАКОМЕНТУЙ РЯДКИ З getAdminDashboard
// router.get("/admin/dashboard", protect, protectAdmin, getAdminDashboard); <--- ЦЕ БУЛО ПРИЧИНОЮ ПОМИЛКИ

export default router;
