import mongoose from "mongoose";

export const PLANNER_TEXTURE_SURFACE_COLLECTIONS = {
  floor: "planner_floor_textures",
  wall: "planner_wall_textures",
  door: "planner_door_textures",
};

export const PLANNER_TEXTURE_MODEL_NAMES = {
  floor: "PlannerFloorTexture",
  wall: "PlannerWallTexture",
  door: "PlannerDoorTexture",
};

const localizedTextSchema = new mongoose.Schema(
  {
    ua: { type: String, required: true, trim: true },
    uk: { type: String, default: "", trim: true },
    en: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const repeatSchema = new mongoose.Schema(
  {
    x: { type: Number, default: 1, min: 0.01 },
    y: { type: Number, default: 1, min: 0.01 },
  },
  { _id: false }
);

const createPlannerTextureSchema = () => {
  const plannerTextureSchema = new mongoose.Schema(
    {
      key: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        index: true,
      },
      slug: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        index: true,
      },
      translationKey: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
      },
      name: { type: localizedTextSchema, required: true },
      surfaceType: {
        type: String,
        required: true,
        enum: ["floor", "wall", "door"],
        index: true,
      },
      textureUrl: { type: String, required: true, trim: true },
      previewUrl: { type: String, default: "", trim: true },
      cloudinaryPublicId: { type: String, default: null, trim: true },
      mimeType: { type: String, default: "", trim: true },
      width: { type: Number, default: 0, min: 0 },
      height: { type: Number, default: 0, min: 0 },
      isSeamless: { type: Boolean, default: true },
      repeat: { type: repeatSchema, default: () => ({ x: 1, y: 1 }) },
      normalMapUrl: { type: String, default: "", trim: true },
      roughnessMapUrl: { type: String, default: "", trim: true },
      aoMapUrl: { type: String, default: "", trim: true },
      metalnessMapUrl: { type: String, default: "", trim: true },
      sortOrder: { type: Number, default: 0, index: true },
      isActive: { type: Boolean, default: true, index: true },
    },
    { timestamps: true }
  );

  plannerTextureSchema.index({ cloudinaryPublicId: 1 }, { unique: true, sparse: true });
  plannerTextureSchema.index({ translationKey: 1 }, { unique: true, sparse: true });
  plannerTextureSchema.index({ isActive: 1, sortOrder: 1, key: 1 });

  return plannerTextureSchema;
};

export const PlannerTextureModels = Object.fromEntries(
  Object.entries(PLANNER_TEXTURE_SURFACE_COLLECTIONS).map(([surfaceType, collectionName]) => [
    surfaceType,
    mongoose.models[PLANNER_TEXTURE_MODEL_NAMES[surfaceType]] ||
      mongoose.model(
        PLANNER_TEXTURE_MODEL_NAMES[surfaceType],
        createPlannerTextureSchema(),
        collectionName
      ),
  ])
);

export const getPlannerTextureModel = (surfaceType) => PlannerTextureModels[surfaceType] || null;

const PlannerTexture =
  mongoose.models.PlannerTexture || mongoose.model("PlannerTexture", createPlannerTextureSchema());

export default PlannerTexture;
