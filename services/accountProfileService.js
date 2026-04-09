import fs from "fs";
import multer from "multer";
import path from "path";
import mongoose from "mongoose";

const avatarUploadDir = path.join(process.cwd(), "uploads", "avatars");

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

ensureDir(avatarUploadDir);

const safeSlug = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, avatarUploadDir);
  },
  filename: (req, file, callback) => {
    const ext = path.extname(file.originalname || "") || ".bin";
    const base = safeSlug(path.basename(file.originalname || "avatar", ext)) || "avatar";
    const userId =
      String(req.params?.id || req.user?._id || req.user?.id || "user").replace(/[^a-z0-9]/gi, "");
    callback(null, `${userId}-${Date.now()}-${base}${ext}`);
  },
});

export const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!String(file.mimetype || "").startsWith("image/")) {
      const error = new Error("Only image uploads are allowed");
      error.statusCode = 400;
      return callback(error);
    }
    return callback(null, true);
  },
});

export const avatarUploadFields = avatarUpload.fields([
  { name: "avatar", maxCount: 1 },
  { name: "photo", maxCount: 1 },
  { name: "image", maxCount: 1 },
  { name: "file", maxCount: 1 },
]);

export const getUploadedAvatarPath = (req) => {
  const preferredFields = ["avatar", "photo", "image", "file"];
  for (const field of preferredFields) {
    const file = req.files?.[field]?.[0];
    if (file?.filename) {
      return `/uploads/avatars/${file.filename}`;
    }
  }
  return "";
};

export const removeUploadByPublicPath = (publicPath) => {
  const normalized = String(publicPath || "").replace(/^\/+/, "");
  if (!normalized || normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return;
  }

  const absolutePath = path.join(process.cwd(), normalized);
  if (!absolutePath.startsWith(path.join(process.cwd(), "uploads"))) {
    return;
  }

  try {
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  } catch (error) {
    console.error("[avatar remove]", error);
  }
};

const pickStr = (value) => String(value || "").trim();

export const normalizeAddresses = (addresses = []) => {
  const source = Array.isArray(addresses) ? addresses : [];
  const normalized = source
    .map((address, index) => ({
      id:
        pickStr(address?.id) ||
        new mongoose.Types.ObjectId().toHexString(),
      label: pickStr(address?.label),
      city: pickStr(address?.city),
      addressLine: pickStr(address?.addressLine),
      comment: pickStr(address?.comment),
      isPrimary: !!address?.isPrimary,
      sortOrder: index,
    }))
    .filter((address) => address.city || address.addressLine || address.label || address.comment);

  if (!normalized.length) return [];

  let primaryAssigned = false;
  const withPrimary = normalized.map((address, index) => {
    if (!primaryAssigned && address.isPrimary) {
      primaryAssigned = true;
      return address;
    }

    return {
      ...address,
      isPrimary: false,
    };
  });

  if (!primaryAssigned) {
    withPrimary[0].isPrimary = true;
  }

  return withPrimary
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map(({ sortOrder, ...address }) => address);
};
