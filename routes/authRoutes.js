import express from "express";
import { 
  registerUser, 
  loginUser, 
  getMe,
  logoutUser,
  forgotPassword,    // Якщо є
  resetPassword      // Якщо є
} from "../controllers/authController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/me", protect, getMe);
router.post("/logout", protect, logoutUser);

// Якщо є маршрути для скидання пароля
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// ❌ ВИДАЛИ АБО ЗАКОМЕНТУЙ РЯДКИ З getAdminDashboard
// router.get("/admin/dashboard", protect, protectAdmin, getAdminDashboard); <--- ЦЕ БУЛО ПРИЧИНОЮ ПОМИЛКИ

export default router;
