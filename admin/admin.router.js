import { Router } from "express";

import { adminAuditLogger } from "../app/middleware/adminAuditLogger.js";
import { admin, protect } from "../middleware/authMiddleware.js";
import adminAiRoutes from "../routes/adminAiRoutes.js";
import categoriesRoutes from "./routes/categories.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import inventoryRoutes from "./routes/inventory.routes.js";
import locationsRoutes from "./routes/locations.routes.js";
import ordersRoutes from "./routes/orders.routes.js";
import plannerTexturesRoutes from "./routes/plannerTextures.routes.js";
import productQuestionsRoutes from "./routes/productQuestions.routes.js";
import referenceDictionariesRoutes from "./routes/referenceDictionaries.routes.js";
import productsRoutes from "./routes/products.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import specRoutes from "./routes/spec.routes.js";
import subcategoriesRoutes from "./routes/subcategories.routes.js";
import usersRoutes from "./routes/users.routes.js";

const router = Router();

router.use(protect, admin);
router.use(adminAuditLogger);

router.use(dashboardRoutes);
router.use("/settings", settingsRoutes);
router.use(productsRoutes);
router.use(categoriesRoutes);
router.use(subcategoriesRoutes);
router.use(usersRoutes);
router.use(ordersRoutes);
router.use(productQuestionsRoutes);
router.use("/planner-textures", plannerTexturesRoutes);
router.use(locationsRoutes);
router.use(inventoryRoutes);
router.use(referenceDictionariesRoutes);
router.use(specRoutes);
router.use(chatRoutes);
router.use("/ai", adminAiRoutes);

export default router;
