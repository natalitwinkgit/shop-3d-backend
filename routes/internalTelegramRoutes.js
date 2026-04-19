import express from "express";

import {
  getTelegramUserAddresses,
  getTelegramUserDiscount,
  getTelegramUserFavorites,
  getTelegramUserOrders,
  getTelegramUserProfile,
  resolveTelegramUserByPhone,
  updateTelegramUserPhoneFromContact,
} from "../controllers/internalTelegramController.js";
import { requireInternalAuth } from "../middleware/internalAuthMiddleware.js";

const router = express.Router();

router.use(requireInternalAuth);

router.post("/telegram/users/resolve-by-phone", resolveTelegramUserByPhone);
router.patch("/telegram/users/:websiteUserId/phone-from-telegram", updateTelegramUserPhoneFromContact);
router.get("/telegram/users/:websiteUserId/profile", getTelegramUserProfile);
router.get("/telegram/users/:websiteUserId/orders", getTelegramUserOrders);
router.get("/telegram/users/:websiteUserId/discount", getTelegramUserDiscount);
router.get("/telegram/users/:websiteUserId/favorites", getTelegramUserFavorites);
router.get("/telegram/users/:websiteUserId/addresses", getTelegramUserAddresses);

export default router;
