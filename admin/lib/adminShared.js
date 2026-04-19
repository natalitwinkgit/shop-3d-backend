import bcrypt from "bcryptjs";
import fs from "fs";
import multer from "multer";
import path from "path";

import Category from "../../models/Category.js";
import { safeRasterImageFileFilter } from "../../services/uploadValidationService.js";
import Message from "../../models/Message.js";
import User, {
  ADMIN_ROLES,
  isAdminRole,
  normalizePhone,
} from "../../models/userModel.js";
import {
  buildAdminConversationSummaries as buildAdminConversationSummariesFromService,
  countChatConversations as countChatConversationsFromService,
} from "../../services/adminChatService.js";

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const safeSlug = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

export const toBool = (value) => String(value) === "true" || String(value) === "1";

const rootUploads = path.join(process.cwd(), "uploads");
const productUploads = path.join(rootUploads, "products");
const categoryUploads = path.join(rootUploads, "categories");

ensureDir(productUploads);
ensureDir(categoryUploads);

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    if (file.fieldname === "image") return callback(null, categoryUploads);
    return callback(null, productUploads);
  },
  filename: (req, file, callback) => {
    const ext = path.extname(file.originalname || "");
    const base = safeSlug(path.basename(file.originalname || "file", ext));
    callback(null, `${file.fieldname}-${Date.now()}-${base}${ext || ""}`);
  },
});

export const adminUpload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: safeRasterImageFileFilter,
});

const isObjectIdLike = (value) => /^[a-f0-9]{24}$/i.test(String(value || ""));

export const loadAdminIndex = async () => {
  const admins = await User.find({ role: { $in: ADMIN_ROLES } })
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

export const ensureEmailIsUnique = async ({ email, excludeUserId = null }) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return;

  const existing = await User.findOne({
    email: normalizedEmail,
    ...(excludeUserId ? { _id: { $ne: excludeUserId } } : {}),
  }).lean();

  if (existing) {
    const error = new Error("User with this email already exists");
    error.statusCode = 409;
    throw error;
  }
};

export const ensurePhoneIsUnique = async ({ phone, excludeUserId = null }) => {
  const normalized = normalizePhone(phone);
  if (!normalized) return "";

  const existing = await User.findOne({
    phoneNormalized: normalized,
    ...(excludeUserId ? { _id: { $ne: excludeUserId } } : {}),
  }).lean();

  if (existing) {
    const error = new Error("User with this phone already exists");
    error.statusCode = 409;
    throw error;
  }

  return normalized;
};

export const assertActorCanManageUserProfile = (actor, targetUser) => {
  if (String(actor?._id || actor?.id || "") === String(targetUser?._id || "")) {
    return;
  }

  if (!isAdminRole(actor?.role)) {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    throw error;
  }

  if (targetUser?.role === "superadmin" && actor?.role !== "superadmin") {
    const error = new Error("Only superadmin can manage superadmin users");
    error.statusCode = 403;
    throw error;
  }

  if (isAdminRole(targetUser?.role) && actor?.role !== "superadmin") {
    const error = new Error("Only superadmin can manage admin users");
    error.statusCode = 403;
    throw error;
  }
};

export const hashPassword = async (password) => bcrypt.hash(password, 10);

export const loadUserNameMap = async (ids) => {
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

export const getParticipantName = ({ participantId, messageDoc, userMap, adminMap }) => {
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

export const buildAdminConversationSummaries = async () => {
  return buildAdminConversationSummariesFromService();
};

export const countChatConversations = async () => {
  return countChatConversationsFromService();
};

export const listFlatSubcategories = async (category) => {
  const query = {};
  if (category) query.category = String(category);

  const parents = await Category.find(query)
    .select("category names description children")
    .sort({ order: 1, createdAt: -1 })
    .lean();

  const rows = [];
  for (const parent of parents) {
    for (const child of Array.isArray(parent.children) ? parent.children : []) {
      rows.push({
        parentCategory: parent.category,
        parentNames: parent.names,
        parentDescription: parent.description || { ua: "", en: "" },
        key: child.key,
        names: child.names,
        description: child.description || { ua: "", en: "" },
        image: child.image || "",
        order: Number(child.order) || 0,
        id: `${parent.category}:${child.key}`,
      });
    }
  }

  return rows;
};
