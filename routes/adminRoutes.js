import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import bcrypt from "bcryptjs";

import { protect, admin } from "../middleware/authMiddleware.js";
import {
  adminListOrders,
  adminGetOrder,
  adminPatchOrder,
  adminCancelOrder,
  adminDeleteOrder,
} from "../controllers/orderController.js";
import { getProductsStats } from "../controllers/productController.js";
import {
  getByLocation as getInventoryByLocation,
  getByProduct as getInventoryByProduct,
  getMovements as getInventoryMovements,
  getOverview as getInventoryOverview,
  transfer as transferInventory,
  upsert as upsertInventory,
} from "../controllers/inventoryController.js";
import {
  createLocation,
  getAdminLocations,
  setLocationStatus,
  updateLocation,
} from "../controllers/locationController.js";
import adminAiRoutes from "./adminAiRoutes.js";

import Product from "../models/Product.js";
import Category from "../models/Category.js";
import User from "../models/userModel.js";
import Message from "../models/Message.js";
import SpecTemplate from "../models/SpecTemplate.js";
import SpecField from "../models/SpecField.js";
import Inventory from "../models/Inventory.js";
import Location from "../models/Location.js";
import {
  buildPublicUserResponse,
  createUserReward,
  getAdminUserDetail,
  listAdminUserOrders,
  listAdminUsersData,
  normalizeUserPhone,
  syncUserCommerceData,
  updateUserLoyaltySettings,
  updateUserReward,
} from "../services/userProfileService.js";

const router = express.Router();

router.use(protect, admin);

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const safeSlug = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const toBool = (v) => String(v) === "true" || String(v) === "1";

const rootUploads = path.join(process.cwd(), "uploads");
const productUploads = path.join(rootUploads, "products");
const categoryUploads = path.join(rootUploads, "categories");

ensureDir(productUploads);
ensureDir(categoryUploads);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "image") return cb(null, categoryUploads);
    return cb(null, productUploads);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    const base = safeSlug(path.basename(file.originalname || "file", ext));
    cb(null, `${file.fieldname}-${Date.now()}-${base}${ext || ""}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 },
});

const isObjectIdLike = (value) => /^[a-f0-9]{24}$/i.test(String(value || ""));

const loadAdminIndex = async () => {
  const admins = await User.find({ role: "admin" })
    .select("_id name email role")
    .lean();

  const adminIds = admins.map((adminUser) => String(adminUser._id));
  const adminSet = new Set(adminIds);
  const adminMap = new Map(
    admins.map((adminUser) => [
      String(adminUser._id),
      {
        _id: String(adminUser._id),
        name: adminUser.name || adminUser.email || "Admin",
        email: adminUser.email || "",
      },
    ])
  );

  return { admins, adminIds, adminSet, adminMap };
};

const loadUserNameMap = async (ids) => {
  const objectIds = Array.from(new Set(ids.filter((id) => isObjectIdLike(id))));
  if (!objectIds.length) return new Map();

  const users = await User.find({ _id: { $in: objectIds } })
    .select("_id name email role")
    .lean();

  return new Map(
    users.map((userDoc) => [
      String(userDoc._id),
      {
        _id: String(userDoc._id),
        name: userDoc.name || userDoc.email || "User",
        email: userDoc.email || "",
        role: userDoc.role || "user",
      },
    ])
  );
};

const getParticipantName = ({ participantId, messageDoc, userMap, adminMap }) => {
  const id = String(participantId || "");

  if (adminMap.has(id)) return adminMap.get(id)?.name || "Admin";

  if (id.startsWith("guest_")) {
    return String(messageDoc?.guestName || "").trim() || "Guest";
  }

  if (userMap.has(id)) {
    const userDoc = userMap.get(id);
    return userDoc?.name || userDoc?.email || "User";
  }

  return "User";
};

const buildAdminConversationSummaries = async () => {
  const { adminIds, adminSet, adminMap } = await loadAdminIndex();
  if (!adminIds.length) return [];

  const messages = await Message.find({
    $or: [{ sender: { $in: adminIds } }, { receiver: { $in: adminIds } }],
  })
    .sort({ createdAt: -1 })
    .lean();

  const externalIds = new Set();
  const conversationMap = new Map();

  for (const messageDoc of messages) {
    const senderId = String(messageDoc.sender || "");
    const receiverId = String(messageDoc.receiver || "");
    const senderIsAdmin = adminSet.has(senderId);
    const receiverIsAdmin = adminSet.has(receiverId);

    if (senderIsAdmin && receiverIsAdmin) continue;
    if (!senderIsAdmin && !receiverIsAdmin) continue;

    const externalId = senderIsAdmin ? receiverId : senderId;
    externalIds.add(externalId);

    if (!conversationMap.has(externalId)) {
      conversationMap.set(externalId, {
        userId: externalId,
        userName: "",
        name: "",
        lastMessage: String(messageDoc.text || ""),
        lastDate: messageDoc.createdAt,
        unreadCount: 0,
        isGuest: externalId.startsWith("guest_") || !!messageDoc.isGuest,
        answeredByAdminId: null,
        answeredByAdminName: null,
        adminIds: new Set(),
        adminNames: new Set(),
      });
    }

    const conversation = conversationMap.get(externalId);

    if (!senderIsAdmin && !messageDoc.isRead) {
      conversation.unreadCount += 1;
    }

    if (senderIsAdmin) {
      conversation.adminIds.add(senderId);
      const adminName = adminMap.get(senderId)?.name;
      if (adminName) conversation.adminNames.add(adminName);

      if (!conversation.answeredByAdminId) {
        conversation.answeredByAdminId = senderId;
        conversation.answeredByAdminName = adminName || "Admin";
      }
    }

    if (conversation.isGuest && !conversation.userName) {
      conversation.userName = String(messageDoc.guestName || "").trim();
      conversation.name = conversation.userName;
    }
  }

  const userMap = await loadUserNameMap(Array.from(externalIds));

  return Array.from(conversationMap.values())
    .map((conversation) => {
      const fallbackName =
        conversation.isGuest
          ? conversation.userName || "Guest"
          : userMap.get(conversation.userId)?.name ||
            userMap.get(conversation.userId)?.email ||
            "User";

      return {
        userId: conversation.userId,
        userName: fallbackName,
        name: fallbackName,
        lastMessage: conversation.lastMessage,
        lastDate: conversation.lastDate,
        unreadCount: conversation.unreadCount,
        isGuest: conversation.isGuest,
        answeredByAdminId: conversation.answeredByAdminId,
        answeredByAdminName: conversation.answeredByAdminName,
        adminIds: Array.from(conversation.adminIds),
        adminNames: Array.from(conversation.adminNames),
      };
    })
    .sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());
};

const countChatConversations = async () => {
  const conversations = await buildAdminConversationSummaries();
  return conversations.length;
};

const listFlatSubcategories = async (category) => {
  const query = {};
  if (category) query.category = String(category);

  const parents = await Category.find(query)
    .select("category names children")
    .sort({ order: 1, createdAt: -1 })
    .lean();

  const rows = [];
  for (const parent of parents) {
    for (const child of Array.isArray(parent.children) ? parent.children : []) {
      rows.push({
        parentCategory: parent.category,
        parentNames: parent.names,
        key: child.key,
        names: child.names,
        image: child.image || "",
        order: Number(child.order) || 0,
        id: `${parent.category}:${child.key}`,
      });
    }
  }

  return rows;
};

const addSpecFieldToTemplate = async (req, res, { includeTemplate }) => {
  try {
    const { typeKey } = req.params;
    const { sectionId = "main", field } = req.body || {};

    if (
      !field?.key ||
      !field?.label?.ua ||
      !field?.label?.en ||
      !field?.kind ||
      !field?.path
    ) {
      return res.status(400).json({ message: "Invalid field" });
    }

    await SpecField.updateOne(
      { key: field.key },
      { $set: { ...field, isActive: true } },
      { upsert: true }
    );

    const tpl = await SpecTemplate.findOneAndUpdate(
      { typeKey },
      {
        $setOnInsert: {
          typeKey,
          title: { ua: typeKey, en: typeKey },
          sections: [
            {
              id: "main",
              title: { ua: "Характеристики", en: "Specifications" },
              fieldKeys: [],
            },
          ],
          isActive: true,
        },
      },
      { upsert: true, new: true }
    );

    const sections = Array.isArray(tpl.sections) ? tpl.sections : [];
    const idx = sections.findIndex((section) => section.id === sectionId);

    if (idx === -1) {
      sections.push({
        id: sectionId,
        title: { ua: "Характеристики", en: "Specifications" },
        fieldKeys: [field.key],
      });
    } else {
      const set = new Set(sections[idx].fieldKeys || []);
      set.add(field.key);
      sections[idx].fieldKeys = Array.from(set);
    }

    tpl.sections = sections;
    await tpl.save();

    return res.json(includeTemplate ? { ok: true, template: tpl } : { ok: true });
  } catch (e) {
    console.error("[ADMIN spec add-field]", e);
    return res.status(500).json({ message: "Server error" });
  }
};

const getChatConversations = async (req, res) => {
  try {
    const conversations = await buildAdminConversationSummaries();
    res.json(conversations);
  } catch (e) {
    console.error("[ADMIN chat conversations]", e);
    res.status(500).json({ message: "Failed to load conversations" });
  }
};

const getSupportAdmin = async (req, res) => {
  try {
    const currentAdminId = String(req.user?._id || req.user?.id || "");
    if (currentAdminId) {
      return res.json({
        adminId: currentAdminId,
        adminName: req.user?.name || req.user?.email || "Admin",
      });
    }

    const firstAdmin = await User.findOne({ role: "admin" }).select("_id name email").lean();
    if (!firstAdmin) return res.status(404).json({ message: "No admin found" });

    return res.json({
      adminId: String(firstAdmin._id),
      adminName: firstAdmin.name || firstAdmin.email || "Admin",
    });
  } catch (e) {
    return res.status(500).json({ message: "Failed to get admin id" });
  }
};

const getAdminDashboard = async (req, res) => {
  try {
    const [products, categories, users, chatConversations, locations, inventoryRows, showcaseRows] = await Promise.all([
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
  } catch (e) {
    console.error("[ADMIN dashboard]", e);
    res.status(500).json({ message: "Помилка сервера" });
  }
};

router.get("/dashboard", getAdminDashboard);
router.get("/stats", getAdminDashboard);

router.get("/products", async (req, res) => {
  try {
    const items = await Product.find({}).sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (e) {
    res.status(500).json({ message: "Failed to load products" });
  }
});

router.get("/products/stats", getProductsStats);

router.get("/products/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (e) {
    res.status(400).json({ message: "Product not found" });
  }
});

router.post(
  "/products",
  upload.fields([
    { name: "images", maxCount: 20 },
    { name: "modelFile", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const body = req.body || {};

      const name = JSON.parse(body.name || "{}");
      const description = JSON.parse(body.description || "{}");

      const styleKeys = JSON.parse(body.styleKeys || "[]");
      const colorKeys = JSON.parse(body.colorKeys || "[]");
      const roomKeys = JSON.parse(body.roomKeys || "[]");
      const collectionKeys = JSON.parse(body.collectionKeys || "[]");
      const featureKeys = JSON.parse(body.featureKeys || "[]");

      const specifications = JSON.parse(body.specifications || "{}");

      const imageFiles = req.files?.images || [];
      const modelFiles = req.files?.modelFile || [];

      const images = imageFiles.map((file) => `/uploads/products/${file.filename}`);
      const modelUrl = modelFiles[0] ? `/uploads/products/${modelFiles[0].filename}` : "";

      const doc = await Product.create({
        name,
        description,
        slug: String(body.slug || "").trim(),
        category: String(body.category || "").trim(),
        subCategory: String(body.subCategory || "").trim(),
        typeKey: String(body.typeKey || "").trim(),
        price: Number(body.price || 0),
        discount: Number(body.discount || 0),
        inStock: toBool(body.inStock),
        stockQty: Number(body.stockQty || 0),
        status: String(body.status || "active"),
        styleKeys,
        colorKeys,
        roomKeys,
        collectionKeys,
        featureKeys,
        specifications,
        images,
        modelUrl,
      });

      res.status(201).json(doc);
    } catch (e) {
      console.error("[ADMIN products POST]", e);
      res.status(400).json({ message: "Create product failed" });
    }
  }
);

router.put(
  "/products/:id",
  upload.fields([
    { name: "images", maxCount: 20 },
    { name: "modelFile", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const body = req.body || {};
      const product = await Product.findById(req.params.id);
      if (!product) return res.status(404).json({ message: "Product not found" });

      const name = JSON.parse(body.name || "{}");
      const description = JSON.parse(body.description || "{}");

      const styleKeys = JSON.parse(body.styleKeys || "[]");
      const colorKeys = JSON.parse(body.colorKeys || "[]");
      const roomKeys = JSON.parse(body.roomKeys || "[]");
      const collectionKeys = JSON.parse(body.collectionKeys || "[]");
      const featureKeys = JSON.parse(body.featureKeys || "[]");

      const specifications = JSON.parse(body.specifications || "{}");

      let keepImages = [];
      try {
        keepImages = JSON.parse(body.keepImages || "[]");
      } catch {
        keepImages = [];
      }

      const newImageFiles = req.files?.images || [];
      const newImages = newImageFiles.map((file) => `/uploads/products/${file.filename}`);

      const modelFiles = req.files?.modelFile || [];
      const newModel = modelFiles[0] ? `/uploads/products/${modelFiles[0].filename}` : null;

      product.name = name;
      product.description = description;
      product.slug = String(body.slug || "").trim();
      product.category = String(body.category || "").trim();
      product.subCategory = String(body.subCategory || "").trim();
      product.typeKey = String(body.typeKey || "").trim();
      product.price = Number(body.price || 0);
      product.discount = Number(body.discount || 0);
      product.inStock = toBool(body.inStock);
      product.stockQty = Number(body.stockQty || 0);
      product.status = String(body.status || "active");

      product.styleKeys = styleKeys;
      product.colorKeys = colorKeys;
      product.roomKeys = roomKeys;
      product.collectionKeys = collectionKeys;
      product.featureKeys = featureKeys;
      product.specifications = specifications;

      product.images = [...(Array.isArray(keepImages) ? keepImages : []), ...newImages];

      if (newModel) product.modelUrl = newModel;

      const saved = await product.save();
      res.json(saved);
    } catch (e) {
      console.error("[ADMIN products PUT]", e);
      res.status(400).json({ message: "Update product failed" });
    }
  }
);

router.delete("/products/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    await product.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: "Delete product failed" });
  }
});

router.get("/categories", async (req, res) => {
  try {
    const items = await Category.find({}).sort({ order: 1, createdAt: -1 }).lean();
    res.json(items);
  } catch (e) {
    res.status(500).json({ message: "Failed to load categories" });
  }
});

router.get("/categories/:category/children", async (req, res) => {
  try {
    const doc = await Category.findOne({ category: req.params.category })
      .select("category names image order children")
      .lean();

    if (!doc) return res.status(404).json({ message: "Категорію не знайдено" });

    res.json({
      parent: {
        category: doc.category,
        names: doc.names,
        image: doc.image,
        order: doc.order,
      },
      children: Array.isArray(doc.children) ? doc.children : [],
    });
  } catch (e) {
    res.status(500).json({ message: "Помилка при отриманні підкатегорій" });
  }
});

router.post("/categories/:category/children", async (req, res) => {
  try {
    const { category } = req.params;
    const { key, name_ua, name_en, image = "", order = 0 } = req.body || {};

    if (!key || !name_ua || !name_en) {
      return res.status(400).json({ message: "key, name_ua, name_en - required" });
    }

    const doc = await Category.findOne({ category });
    if (!doc) return res.status(404).json({ message: "Категорію не знайдено" });

    const exists = (doc.children || []).some((child) => child.key === key);
    if (exists) return res.status(409).json({ message: "Підкатегорія з таким key вже існує" });

    doc.children.push({
      key,
      names: { ua: name_ua, en: name_en },
      image,
      order: Number(order) || 0,
    });

    await doc.save();
    res.status(201).json(doc);
  } catch (e) {
    console.error("[ADMIN categories children POST]", e);
    res.status(500).json({ message: "Помилка при створенні підкатегорії" });
  }
});

router.put("/categories/:category/children/:key", async (req, res) => {
  try {
    const { category, key } = req.params;
    const { name_ua, name_en, image, order } = req.body || {};

    const doc = await Category.findOne({ category });
    if (!doc) return res.status(404).json({ message: "Категорію не знайдено" });

    const idx = (doc.children || []).findIndex((child) => child.key === key);
    if (idx === -1) return res.status(404).json({ message: "Підкатегорію не знайдено" });

    if (name_ua) doc.children[idx].names.ua = name_ua;
    if (name_en) doc.children[idx].names.en = name_en;
    if (typeof image === "string") doc.children[idx].image = image;
    if (order != null) doc.children[idx].order = Number(order) || 0;

    await doc.save();
    res.json(doc);
  } catch (e) {
    console.error("[ADMIN categories children PUT]", e);
    res.status(500).json({ message: "Помилка при оновленні підкатегорії" });
  }
});

router.delete("/categories/:category/children/:key", async (req, res) => {
  try {
    const { category, key } = req.params;

    const doc = await Category.findOne({ category });
    if (!doc) return res.status(404).json({ message: "Категорію не знайдено" });

    doc.children = (doc.children || []).filter((child) => child.key !== key);
    await doc.save();

    res.json({ message: "Підкатегорію видалено" });
  } catch (e) {
    console.error("[ADMIN categories children DELETE]", e);
    res.status(500).json({ message: "Помилка при видаленні підкатегорії" });
  }
});

router.post("/categories", upload.single("image"), async (req, res) => {
  try {
    const { category, name_ua, name_en, order, imageUrl } = req.body || {};
    if (!category || !name_ua || !name_en) {
      return res.status(400).json({ message: "category + name_ua + name_en are required" });
    }

    const image = req.file
      ? `/uploads/categories/${req.file.filename}`
      : (String(imageUrl || "").trim() || "");

    const doc = await Category.create({
      category: String(category).trim(),
      names: { ua: String(name_ua || ""), en: String(name_en || "") },
      order: Number(order || 0),
      image,
      children: [],
    });

    res.status(201).json(doc);
  } catch (e) {
    console.error("[ADMIN categories POST]", e);
    res.status(400).json({ message: "Create category failed" });
  }
});

router.put("/categories/:id", upload.single("image"), async (req, res) => {
  try {
    const cat = await Category.findById(req.params.id);
    if (!cat) return res.status(404).json({ message: "Category not found" });

    const { name_ua, name_en, order, imageUrl } = req.body || {};

    cat.names = {
      ua: String(name_ua ?? cat.names?.ua ?? ""),
      en: String(name_en ?? cat.names?.en ?? ""),
    };
    cat.order = Number(order ?? cat.order ?? 0);

    if (req.file) {
      cat.image = `/uploads/categories/${req.file.filename}`;
    } else if (typeof imageUrl === "string") {
      cat.image = imageUrl.trim();
    }

    const saved = await cat.save();
    res.json(saved);
  } catch (e) {
    console.error("[ADMIN categories PUT]", e);
    res.status(400).json({ message: "Update category failed" });
  }
});

router.delete("/categories/:id", async (req, res) => {
  try {
    const cat = await Category.findById(req.params.id);
    if (!cat) return res.status(404).json({ message: "Category not found" });

    await cat.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: "Delete category failed" });
  }
});

router.get("/subcategories", async (req, res) => {
  try {
    const rows = await listFlatSubcategories(req.query.category);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: "Помилка при отриманні підкатегорій" });
  }
});

router.get("/users", async (req, res) => {
  try {
    const users = await listAdminUsersData();
    res.json(users);
  } catch (e) {
    res.status(500).json({ message: "Failed to load users" });
  }
});

router.post("/users", async (req, res) => {
  try {
    const { firstName, lastName, email, phone, role, status, password } = req.body || {};
    if (!email || !firstName || !password) {
      return res.status(400).json({ message: "Email, firstName and password are required" });
    }

    const exists = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (exists) return res.status(400).json({ message: "Email already exists" });

    const name = `${String(firstName || "").trim()} ${String(lastName || "").trim()}`.trim();
    const hashed = await bcrypt.hash(String(password), 10);

    const user = await User.create({
      name,
      email: String(email).toLowerCase().trim(),
      phone: normalizeUserPhone(phone),
      password: hashed,
      role: role || "user",
      status: status || "active",
    });

    const synced = await syncUserCommerceData(user._id);
    res.status(201).json(synced || buildPublicUserResponse(user));
  } catch (e) {
    console.error("[ADMIN users POST]", e);
    res.status(400).json({ message: "Create user failed" });
  }
});

router.get("/users/:id", async (req, res) => {
  try {
    const detail = await getAdminUserDetail(req.params.id);
    res.json(detail);
  } catch (e) {
    res.status(e.statusCode || 500).json({ message: e.message || "Failed to load user detail" });
  }
});

router.get("/users/:id/orders", async (req, res) => {
  try {
    const result = await listAdminUserOrders(req.params.id, {
      page: req.query.page,
      limit: req.query.limit,
      status: req.query.status,
    });
    res.json(result);
  } catch (e) {
    res.status(e.statusCode || 500).json({ message: e.message || "Failed to load user orders" });
  }
});

router.patch("/users/:id/loyalty", async (req, res) => {
  try {
    await updateUserLoyaltySettings(req.params.id, req.body || {});
    const detail = await getAdminUserDetail(req.params.id);
    res.json(detail.user);
  } catch (e) {
    res.status(e.statusCode || 400).json({ message: e.message || "Failed to update loyalty" });
  }
});

router.post("/users/:id/rewards", async (req, res) => {
  try {
    const rewards = await createUserReward(req.params.id, req.body || {});
    res.status(201).json({ rewards });
  } catch (e) {
    res.status(e.statusCode || 400).json({ message: e.message || "Failed to create reward" });
  }
});

router.patch("/users/:id/rewards/:rewardId", async (req, res) => {
  try {
    const rewards = await updateUserReward(req.params.id, req.params.rewardId, req.body || {});
    res.json({ rewards });
  } catch (e) {
    res.status(e.statusCode || 400).json({ message: e.message || "Failed to update reward" });
  }
});

router.put("/users/:id", async (req, res) => {
  try {
    const { firstName, lastName, email, phone, role, status, password } = req.body || {};
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (typeof firstName === "string" || typeof lastName === "string") {
      const name = `${String(firstName || "").trim()} ${String(lastName || "").trim()}`.trim();
      if (name) user.name = name;
    }

    if (typeof email === "string" && email.trim()) user.email = email.toLowerCase().trim();
    if (phone !== undefined) user.phone = normalizeUserPhone(phone);
    if (typeof role === "string" && role.trim()) user.role = role.trim();
    if (typeof status === "string" && status.trim()) user.status = status.trim();

    if (typeof password === "string" && password.trim()) {
      user.password = await bcrypt.hash(password.trim(), 10);
    }

    await user.save();

    const synced = await syncUserCommerceData(user._id);
    res.json(synced || buildPublicUserResponse(user));
  } catch (e) {
    console.error("[ADMIN users PUT]", e);
    res.status(400).json({ message: "Update user failed" });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    await user.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: "Delete user failed" });
  }
});

router.get("/orders", adminListOrders);
router.get("/orders/:id", adminGetOrder);
router.patch("/orders/:id", adminPatchOrder);
router.post("/orders/:id/cancel", adminCancelOrder);
router.delete("/orders/:id", adminDeleteOrder);

router.get("/locations", getAdminLocations);
router.post("/locations", createLocation);
router.put("/locations/:id", updateLocation);
router.patch("/locations/:id/status", setLocationStatus);

router.get("/inventory/overview", getInventoryOverview);
router.get("/inventory/location/:locationId", getInventoryByLocation);
router.get("/inventory/product/:productId", getInventoryByProduct);
router.patch("/inventory", upsertInventory);
router.post("/inventory/transfer", transferInventory);
router.get("/inventory/movements", getInventoryMovements);

router.get("/spec-templates/:typeKey", async (req, res) => {
  try {
    const typeKey = String(req.params.typeKey || "default");
    const tpl = await SpecTemplate.findOne({ typeKey, isActive: true }).lean();
    if (!tpl) return res.status(404).json({ message: "Spec template not found" });
    res.json(tpl);
  } catch (e) {
    console.error("[ADMIN spec template GET]", e);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/spec-templates/:typeKey/add-field", async (req, res) =>
  addSpecFieldToTemplate(req, res, { includeTemplate: true })
);

router.post("/spec-config/:typeKey/add-field", async (req, res) =>
  addSpecFieldToTemplate(req, res, { includeTemplate: false })
);

router.get("/chat-conversations", getChatConversations);
router.get("/chat/conversations", getChatConversations);
router.use("/ai", adminAiRoutes);

router.get("/chat/support-admin", getSupportAdmin);
router.get("/chat/admin-id", getSupportAdmin);

router.patch("/chat/read/:senderId/:receiverId", async (req, res) => {
  try {
    const { adminIds, adminSet } = await loadAdminIndex();
    const senderId = String(req.params.senderId || "");
    const receiverId = String(req.params.receiverId || "");

    const senderIsAdmin = adminSet.has(senderId);
    const receiverIsAdmin = adminSet.has(receiverId);

    const filter =
      senderIsAdmin !== receiverIsAdmin
        ? {
            sender: senderIsAdmin ? receiverId : senderId,
            receiver: { $in: adminIds },
            isRead: false,
          }
        : {
            sender: senderId,
            receiver: receiverId,
            isRead: false,
          };

    await Message.updateMany(filter, { $set: { isRead: true } });

    res.status(204).end();
  } catch (e) {
    res.status(500).json({ message: "Failed to mark read" });
  }
});

router.get("/chat/:userId1/:userId2", async (req, res) => {
  try {
    const { adminIds, adminSet, adminMap } = await loadAdminIndex();
    const userId1 = String(req.params.userId1 || "");
    const userId2 = String(req.params.userId2 || "");

    const id1IsAdmin = adminSet.has(userId1);
    const id2IsAdmin = adminSet.has(userId2);

    const externalId =
      id1IsAdmin && !id2IsAdmin
        ? userId2
        : !id1IsAdmin && id2IsAdmin
          ? userId1
          : null;

    const historyFilter = externalId
      ? {
          $or: [
            { sender: externalId, receiver: { $in: adminIds } },
            { receiver: externalId, sender: { $in: adminIds } },
          ],
        }
      : {
          $or: [
            { sender: userId1, receiver: userId2 },
            { sender: userId2, receiver: userId1 },
          ],
        };

    const history = await Message.find(historyFilter).sort({ createdAt: 1 }).lean();

    const participantIds = new Set();
    for (const messageDoc of history) {
      participantIds.add(String(messageDoc.sender || ""));
      participantIds.add(String(messageDoc.receiver || ""));
    }

    const userMap = await loadUserNameMap(Array.from(participantIds));

    const payload = history.map((messageDoc) => {
      const senderId = String(messageDoc.sender || "");
      const receiverId = String(messageDoc.receiver || "");
      const senderIsAdmin = adminSet.has(senderId);
      const receiverIsAdmin = adminSet.has(receiverId);

      return {
        ...messageDoc,
        sender: senderId,
        receiver: receiverId,
        senderIsAdmin,
        receiverIsAdmin,
        senderName: getParticipantName({
          participantId: senderId,
          messageDoc,
          userMap,
          adminMap,
        }),
        receiverName: getParticipantName({
          participantId: receiverId,
          messageDoc,
          userMap,
          adminMap,
        }),
        repliedByAdminId: senderIsAdmin ? senderId : null,
        repliedByAdminName: senderIsAdmin ? adminMap.get(senderId)?.name || "Admin" : null,
      };
    });

    res.json(payload);
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
