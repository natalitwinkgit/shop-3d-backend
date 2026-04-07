import { Router } from "express";

import Category from "../../models/Category.js";
import Inventory from "../../models/Inventory.js";
import Location from "../../models/Location.js";
import Product from "../../models/Product.js";
import User from "../../models/userModel.js";
import { countChatConversations } from "../lib/adminShared.js";

const router = Router();

const getAdminDashboard = async (_req, res) => {
  try {
    const [
      products,
      categories,
      users,
      chatConversations,
      locations,
      inventoryRows,
      showcaseRows,
    ] = await Promise.all([
      Product.countDocuments({}),
      Category.countDocuments({}),
      User.countDocuments({}),
      countChatConversations(),
      Location.countDocuments({}),
      Inventory.countDocuments({}),
      Inventory.countDocuments({ isShowcase: true }),
    ]);

    res.json({
      products,
      categories,
      users,
      chatConversations,
      locations,
      inventoryRows,
      showcaseRows,
      ts: Date.now(),
    });
  } catch (error) {
    console.error("[ADMIN dashboard]", error);
    res.status(500).json({ message: "Помилка сервера" });
  }
};

router.get("/dashboard", getAdminDashboard);
router.get("/stats", getAdminDashboard);

export default router;
