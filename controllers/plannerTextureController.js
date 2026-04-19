import mongoose from "mongoose";

import {
  PlannerTextureModels,
  getPlannerTextureModel,
} from "../models/PlannerTexture.js";
import { createHttpError } from "../services/productPayloadService.js";
import {
  buildPlannerTexturePayload,
  buildPlannerTextureAssetPayload,
  createPlannerTextureSurfaceGroups,
  parsePlannerTextureBoolean,
  parsePlannerTextureSurfaceType,
  serializePlannerTexture,
} from "../services/plannerTextureService.js";
import {
  deletePlannerTextureAsset,
  uploadPlannerTextureAsset,
} from "../services/plannerTextureUploadService.js";

const handlePlannerTextureError = (error, next, entityName = "Planner texture") => {
  if (error?.code === 11000) {
    const duplicateField = Object.keys(error?.keyPattern || {})[0] || "field";
    return next(createHttpError(409, `${entityName} ${duplicateField} must be unique`));
  }
  if (error?.name === "ValidationError") {
    return next(createHttpError(400, error.message));
  }
  return next(error);
};

const PLANNER_TEXTURE_SORT = { sortOrder: 1, key: 1 };

const attachSurfaceType = (texture, surfaceType) => ({
  ...(texture || {}),
  surfaceType: texture?.surfaceType || surfaceType,
});

const getPlannerTextureModelEntries = (surfaceType) => {
  if (surfaceType !== undefined) {
    const normalizedSurfaceType = parsePlannerTextureSurfaceType(surfaceType, "surfaceType");
    const textureModel = getPlannerTextureModel(normalizedSurfaceType);
    if (!textureModel) {
      throw createHttpError(
        400,
        `surfaceType must be one of: ${Object.keys(PlannerTextureModels).join(", ")}`
      );
    }
    return [[normalizedSurfaceType, textureModel]];
  }

  return Object.entries(PlannerTextureModels);
};

const sortPlannerTextureItems = (items = []) =>
  [...items].sort((first, second) => {
    const orderDiff = Number(first.sortOrder || 0) - Number(second.sortOrder || 0);
    if (orderDiff !== 0) return orderDiff;
    return String(first.key || "").localeCompare(String(second.key || ""));
  });

const findPlannerTextureByIdOrSlug = async (idOrSlug, { activeOnly = false } = {}) => {
  const normalized = String(idOrSlug || "").trim();
  if (!normalized) throw createHttpError(400, "Planner texture not found");

  const query = {
    ...(activeOnly ? { isActive: { $ne: false } } : {}),
    $or: [{ slug: normalized }, { key: normalized }],
  };

  if (mongoose.Types.ObjectId.isValid(normalized)) {
    query.$or.unshift({ _id: normalized });
  }

  for (const [surfaceType, textureModel] of getPlannerTextureModelEntries()) {
    const texture = await textureModel.findOne(query);
    if (texture) return { texture, textureModel, surfaceType };
  }

  return null;
};

const listPlannerTextures = async ({ activeOnly = false, surfaceType } = {}) => {
  const query = {};
  if (activeOnly) query.isActive = { $ne: false };

  const groupedItems = await Promise.all(
    getPlannerTextureModelEntries(surfaceType).map(async ([textureSurfaceType, textureModel]) => {
      const items = await textureModel.find(query).sort(PLANNER_TEXTURE_SORT).lean();
      return items.map((item) =>
        serializePlannerTexture(attachSurfaceType(item, textureSurfaceType))
      );
    })
  );

  return sortPlannerTextureItems(groupedItems.flat());
};

const listPlannerTextureGroups = async ({ activeOnly = false } = {}) => {
  const query = {};
  if (activeOnly) query.isActive = { $ne: false };

  const surfaceGroups = createPlannerTextureSurfaceGroups();
  await Promise.all(
    getPlannerTextureModelEntries().map(async ([textureSurfaceType, textureModel]) => {
      const items = await textureModel.find(query).sort(PLANNER_TEXTURE_SORT).lean();
      surfaceGroups[textureSurfaceType] = items.map((item) =>
        serializePlannerTexture(attachSurfaceType(item, textureSurfaceType))
      );
    })
  );

  return surfaceGroups;
};

export const getPlannerTextures = async (req, res, next) => {
  try {
    const items = await listPlannerTextures({
      activeOnly: true,
      surfaceType: req.query.surfaceType,
    });
    res.json({ items });
  } catch (error) {
    next(error);
  }
};

export const getPlannerTextureGroups = async (req, res, next) => {
  try {
    const surfaces = await listPlannerTextureGroups({ activeOnly: true });
    res.json({ surfaces });
  } catch (error) {
    next(error);
  }
};

export const getPlannerTexturesBySurface = async (req, res, next) => {
  try {
    const surfaceType = parsePlannerTextureSurfaceType(req.params.surfaceType, "surfaceType");
    const items = await listPlannerTextures({ activeOnly: true, surfaceType });
    res.json({ surfaceType, items });
  } catch (error) {
    next(error);
  }
};

export const getPlannerTextureById = async (req, res, next) => {
  try {
    const result = await findPlannerTextureByIdOrSlug(req.params.id, { activeOnly: true });
    if (!result?.texture) throw createHttpError(404, "Planner texture not found");
    const item = result.texture.toObject?.() || result.texture;
    res.json(serializePlannerTexture(attachSurfaceType(item, result.surfaceType)));
  } catch (error) {
    next(error);
  }
};

export const getAdminPlannerTextures = async (req, res, next) => {
  try {
    const items = await listPlannerTextures({ surfaceType: req.query.surfaceType });
    res.json({ items });
  } catch (error) {
    next(error);
  }
};

export const getAdminPlannerTextureGroups = async (req, res, next) => {
  try {
    const surfaces = await listPlannerTextureGroups();
    res.json({ surfaces });
  } catch (error) {
    next(error);
  }
};

export const getAdminPlannerTexturesBySurface = async (req, res, next) => {
  try {
    const surfaceType = parsePlannerTextureSurfaceType(req.params.surfaceType, "surfaceType");
    const items = await listPlannerTextures({ surfaceType });
    res.json({ surfaceType, items });
  } catch (error) {
    next(error);
  }
};

export const uploadAdminPlannerTextureAsset = async (req, res, next) => {
  try {
    const asset = await uploadPlannerTextureAsset({
      file: req.file,
      surfaceType: req.body.surfaceType,
    });
    res.status(201).json(asset);
  } catch (error) {
    next(error);
  }
};

export const createAdminPlannerTexture = async (req, res, next) => {
  let uploadedAsset = null;

  try {
    const body = { ...req.body };
    if (req.file) {
      uploadedAsset = await uploadPlannerTextureAsset({
        file: req.file,
        surfaceType: req.body.surfaceType,
      });
      Object.assign(body, uploadedAsset);
    }

    const payload = buildPlannerTexturePayload({ body });
    const textureModel = getPlannerTextureModel(payload.surfaceType);
    if (!textureModel) throw createHttpError(400, "surfaceType is not supported");

    const texture = await textureModel.create(payload);
    res.status(201).json(serializePlannerTexture(texture.toObject?.() || texture));
  } catch (error) {
    if (uploadedAsset?.cloudinaryPublicId) {
      await deletePlannerTextureAsset(uploadedAsset.cloudinaryPublicId).catch(() => null);
    }
    handlePlannerTextureError(error, next);
  }
};

export const updateAdminPlannerTexture = async (req, res, next) => {
  let uploadedAsset = null;

  try {
    const existingResult = await findPlannerTextureByIdOrSlug(req.params.id);
    if (!existingResult?.texture) throw createHttpError(404, "Planner texture not found");

    const existingTexture = existingResult.texture;
    const existingTextureObject = attachSurfaceType(
      existingTexture.toObject?.() || existingTexture,
      existingResult.surfaceType
    );

    const body = { ...req.body };
    if (req.file) {
      uploadedAsset = await uploadPlannerTextureAsset({
        file: req.file,
        surfaceType: body.surfaceType || existingTextureObject.surfaceType,
      });
      Object.assign(body, uploadedAsset);
    }

    const payload = buildPlannerTexturePayload({
      body,
      existingTexture: existingTextureObject,
      partial: true,
    });

    const nextSurfaceType = payload.surfaceType || existingTextureObject.surfaceType;
    const targetTextureModel = getPlannerTextureModel(nextSurfaceType);
    if (!targetTextureModel) throw createHttpError(400, "surfaceType is not supported");

    let updatedTexture;
    if (nextSurfaceType !== existingResult.surfaceType) {
      const { id: ignoredId, __v, ...existingFields } = existingTextureObject;
      updatedTexture = await targetTextureModel.create({
        ...existingFields,
        ...payload,
        _id: existingTextureObject._id,
        surfaceType: nextSurfaceType,
      });
      await existingResult.textureModel.deleteOne({ _id: existingTextureObject._id });
    } else {
      updatedTexture = await existingResult.textureModel.findByIdAndUpdate(
        existingTextureObject._id,
        payload,
        {
          new: true,
          runValidators: true,
        }
      );
    }
    if (!updatedTexture) throw createHttpError(404, "Planner texture not found");

    if (
      uploadedAsset?.cloudinaryPublicId &&
      existingTextureObject.cloudinaryPublicId &&
      existingTextureObject.cloudinaryPublicId !== uploadedAsset.cloudinaryPublicId
    ) {
      await deletePlannerTextureAsset(existingTextureObject.cloudinaryPublicId).catch(() => null);
    }

    res.json(
      serializePlannerTexture(
        attachSurfaceType(updatedTexture.toObject?.() || updatedTexture, nextSurfaceType)
      )
    );
  } catch (error) {
    if (uploadedAsset?.cloudinaryPublicId) {
      await deletePlannerTextureAsset(uploadedAsset.cloudinaryPublicId).catch(() => null);
    }
    if (error?.name === "CastError") {
      return next(createHttpError(400, "Planner texture not found"));
    }
    return handlePlannerTextureError(error, next);
  }
};

export const updateAdminPlannerTextureAsset = async (req, res, next) => {
  let uploadedAsset = null;

  try {
    const existingResult = await findPlannerTextureByIdOrSlug(req.params.id);
    if (!existingResult?.texture) throw createHttpError(404, "Planner texture not found");

    const existingTexture = existingResult.texture;
    const existingTextureObject = attachSurfaceType(
      existingTexture.toObject?.() || existingTexture,
      existingResult.surfaceType
    );

    if (req.file) {
      uploadedAsset = await uploadPlannerTextureAsset({
        file: req.file,
        surfaceType: existingTextureObject.surfaceType,
      });
    }

    const payload = buildPlannerTextureAssetPayload({
      body: req.body,
      existingTexture: existingTextureObject,
      uploadedAsset,
    });

    const updatedTexture = await existingResult.textureModel.findByIdAndUpdate(
      existingTextureObject._id,
      payload,
      {
        new: true,
        runValidators: true,
      }
    );
    if (!updatedTexture) throw createHttpError(404, "Planner texture not found");

    if (
      uploadedAsset?.cloudinaryPublicId &&
      existingTextureObject.cloudinaryPublicId &&
      existingTextureObject.cloudinaryPublicId !== uploadedAsset.cloudinaryPublicId
    ) {
      await deletePlannerTextureAsset(existingTextureObject.cloudinaryPublicId).catch(() => null);
    }

    res.json(
      serializePlannerTexture(
        attachSurfaceType(
          updatedTexture.toObject?.() || updatedTexture,
          existingTextureObject.surfaceType
        )
      )
    );
  } catch (error) {
    if (uploadedAsset?.cloudinaryPublicId) {
      await deletePlannerTextureAsset(uploadedAsset.cloudinaryPublicId).catch(() => null);
    }
    if (error?.name === "CastError") {
      return next(createHttpError(400, "Planner texture not found"));
    }
    return handlePlannerTextureError(error, next);
  }
};

export const updateAdminPlannerTextureStatus = async (req, res, next) => {
  try {
    if (req.body?.isActive === undefined) {
      throw createHttpError(400, "isActive is required");
    }

    const existingResult = await findPlannerTextureByIdOrSlug(req.params.id);
    if (!existingResult?.texture) throw createHttpError(404, "Planner texture not found");

    const texture = await existingResult.textureModel.findByIdAndUpdate(
      existingResult.texture._id,
      { isActive: parsePlannerTextureBoolean(req.body.isActive, true) },
      { new: true, runValidators: true }
    );
    if (!texture) throw createHttpError(404, "Planner texture not found");

    res.json(
      serializePlannerTexture(
        attachSurfaceType(texture.toObject?.() || texture, existingResult.surfaceType)
      )
    );
  } catch (error) {
    if (error?.name === "CastError") {
      return next(createHttpError(400, "Planner texture not found"));
    }
    return next(error);
  }
};

export const deleteAdminPlannerTexture = async (req, res, next) => {
  try {
    const existingResult = await findPlannerTextureByIdOrSlug(req.params.id);
    if (!existingResult?.texture) throw createHttpError(404, "Planner texture not found");

    const texture = await existingResult.textureModel.findByIdAndDelete(existingResult.texture._id);
    if (!texture) throw createHttpError(404, "Planner texture not found");

    if (texture.cloudinaryPublicId) {
      await deletePlannerTextureAsset(texture.cloudinaryPublicId).catch(() => null);
    }

    res.json({
      ok: true,
      removed: {
        id: String(texture._id || ""),
        key: String(texture.key || ""),
        surfaceType: String(texture.surfaceType || existingResult.surfaceType || ""),
      },
    });
  } catch (error) {
    if (error?.name === "CastError") {
      return next(createHttpError(400, "Planner texture not found"));
    }
    return next(error);
  }
};
