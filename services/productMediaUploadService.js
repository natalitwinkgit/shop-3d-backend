import fs from "fs";
import multer from "multer";
import path from "path";

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const toSlug = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const rootUploadsDir = path.join(process.cwd(), "uploads");
const productUploadsDir = path.join(rootUploadsDir, "products");
ensureDir(productUploadsDir);

const IMAGE_MIME_PREFIX = "image/";
const MODEL_MIME_ALLOWED = new Set(["model/gltf-binary", "model/gltf+json"]);
const MODEL_EXT_ALLOWED = new Set([".glb", ".gltf", ".usdz", ".obj", ".fbx"]);

const inferModelByExt = (filename = "") => MODEL_EXT_ALLOWED.has(path.extname(filename).toLowerCase());

const isImageField = (fieldName = "") =>
  ["previewImageFile", "imageFiles", "images", "photos", "galleryFiles"].includes(String(fieldName));

const isModelField = (fieldName = "") =>
  ["modelFile", "model", "model3dFile", "glbFile"].includes(String(fieldName));

const productMediaStorage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, productUploadsDir),
  filename: (_req, file, callback) => {
    const ext = path.extname(file.originalname || "");
    const base = toSlug(path.basename(file.originalname || "file", ext)) || "file";
    callback(null, `${Date.now()}-${file.fieldname}-${base}${ext}`);
  },
});

const productMediaFileFilter = (_req, file, callback) => {
  const fieldName = String(file?.fieldname || "");
  const mimeType = String(file?.mimetype || "").toLowerCase();
  const originalName = String(file?.originalname || "");

  if (isImageField(fieldName)) {
    if (mimeType.startsWith(IMAGE_MIME_PREFIX)) return callback(null, true);
    return callback(new Error("Only image files are allowed for image upload fields"));
  }

  if (isModelField(fieldName)) {
    if (MODEL_MIME_ALLOWED.has(mimeType) || inferModelByExt(originalName)) {
      return callback(null, true);
    }
    return callback(new Error("Only 3D model files are allowed for model upload fields"));
  }

  return callback(new Error("Unsupported media upload field"));
};

const productMediaUpload = multer({
  storage: productMediaStorage,
  fileFilter: productMediaFileFilter,
  limits: {
    fileSize: 40 * 1024 * 1024,
    files: 12,
  },
});

export const productMediaUploadFields = productMediaUpload.fields([
  { name: "previewImageFile", maxCount: 1 },
  { name: "imageFiles", maxCount: 10 },
  { name: "images", maxCount: 10 },
  { name: "photos", maxCount: 10 },
  { name: "galleryFiles", maxCount: 10 },
  { name: "modelFile", maxCount: 1 },
  { name: "model", maxCount: 1 },
  { name: "model3dFile", maxCount: 1 },
  { name: "glbFile", maxCount: 1 },
]);

export const toUploadPublicPath = (filePath = "") => {
  const filename = path.basename(String(filePath || ""));
  return filename ? `/uploads/products/${filename}` : "";
};
