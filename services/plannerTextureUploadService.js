import multer from "multer";

import { cloudinary, isCloudinaryConfigured } from "../config/cloudinary.js";
import { createHttpError } from "./productPayloadService.js";
import { parsePlannerTextureSurfaceType } from "./plannerTextureService.js";

const IMAGE_MIME_PREFIX = "image/";

const plannerTextureUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, callback) => {
    const mimeType = String(file?.mimetype || "").toLowerCase();
    if (mimeType.startsWith(IMAGE_MIME_PREFIX)) return callback(null, true);
    return callback(new Error("Only image files are allowed for planner textures"));
  },
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 1,
  },
});

export const plannerTextureUploadSingle = plannerTextureUpload.single("file");

const uploadBufferToCloudinary = async ({ buffer, mimetype, surfaceType, originalname }) =>
  new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `planner/${surfaceType}`,
        resource_type: "image",
        use_filename: true,
        unique_filename: true,
        overwrite: false,
        filename_override: String(originalname || "")
          .replace(/\.[^.]+$/, "")
          .trim(),
        format: mimetype === "image/png" ? "png" : undefined,
      },
      (error, result) => {
        if (error) return reject(error);
        return resolve(result);
      }
    );

    uploadStream.end(buffer);
  });

const buildPlannerTexturePreviewUrl = (publicId) =>
  cloudinary.url(publicId, {
    secure: true,
    resource_type: "image",
    type: "upload",
    transformation: [{ width: 320, crop: "scale", quality: "auto", fetch_format: "auto" }],
  });

export const uploadPlannerTextureAsset = async ({ file, surfaceType }) => {
  if (!file?.buffer?.length) {
    throw createHttpError(400, "Texture file is required");
  }
  if (!isCloudinaryConfigured) {
    throw createHttpError(503, "Cloudinary is not configured");
  }

  const normalizedSurfaceType = parsePlannerTextureSurfaceType(surfaceType, "surfaceType");
  const result = await uploadBufferToCloudinary({
    buffer: file.buffer,
    mimetype: file.mimetype,
    surfaceType: normalizedSurfaceType,
    originalname: file.originalname,
  });

  return {
    textureUrl: String(result?.secure_url || "").trim(),
    previewUrl: buildPlannerTexturePreviewUrl(String(result?.public_id || "").trim()),
    cloudinaryPublicId: String(result?.public_id || "").trim() || null,
    mimeType: String(file.mimetype || result?.format || "").trim(),
    width: Number(result?.width || 0),
    height: Number(result?.height || 0),
    bytes: Number(result?.bytes || 0),
    format: String(result?.format || "").trim(),
    surfaceType: normalizedSurfaceType,
  };
};

export const deletePlannerTextureAsset = async (publicId) => {
  const normalized = String(publicId || "").trim();
  if (!normalized || !isCloudinaryConfigured) return null;
  return cloudinary.uploader.destroy(normalized, { resource_type: "image", invalidate: true });
};
