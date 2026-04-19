import path from "path";

const SAFE_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

const SAFE_IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
]);

const pickLower = (value) => String(value || "").trim().toLowerCase();

export const isSafeRasterImageUpload = (file = {}) => {
  const mimeType = pickLower(file.mimetype);
  const ext = path.extname(pickLower(file.originalname));
  return SAFE_IMAGE_MIME_TYPES.has(mimeType) && SAFE_IMAGE_EXTENSIONS.has(ext);
};

export const createImageUploadError = (message = "Only safe raster image uploads are allowed") => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

export const safeRasterImageFileFilter = (_req, file, callback) => {
  if (isSafeRasterImageUpload(file)) return callback(null, true);
  return callback(createImageUploadError());
};
