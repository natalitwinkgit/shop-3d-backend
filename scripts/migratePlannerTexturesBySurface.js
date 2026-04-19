import mongoose from "mongoose";

import "../config/env.js";
import PlannerTexture, {
  PLANNER_TEXTURE_SURFACE_COLLECTIONS,
  PlannerTextureModels,
  getPlannerTextureModel,
} from "../models/PlannerTexture.js";
import { env } from "../config/env.js";
import {
  buildPlannerTextureTranslationKey,
  normalizePlannerTextureTranslationKey,
  parsePlannerTextureSurfaceType,
} from "../services/plannerTextureService.js";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const deleteSource = args.has("--delete-source");
const backfillTargets = args.has("--backfill-targets");

const getArgValue = (name) => {
  const prefix = `${name}=`;
  const match = [...args].find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
};

const requestedSurfaceType = getArgValue("--surface");

const normalizeSurfaceType = (value) => {
  try {
    return parsePlannerTextureSurfaceType(value, "surfaceType");
  } catch {
    return "";
  }
};

const serializeLegacyTexture = (texture) => {
  const { _id, __v, id, ...fields } = texture.toObject?.() || texture;
  return {
    id: _id,
    fields,
  };
};

const buildI18nFields = ({ fields, surfaceType }) => {
  const key = String(fields.key || fields.slug || "").trim();
  const uaName = String(fields.name?.ua || fields.name?.uk || fields.name?.en || "").trim();
  const ukName = String(fields.name?.uk || fields.name?.ua || fields.name?.en || "").trim();
  const enName = String(fields.name?.en || fields.name?.uk || fields.name?.ua || "").trim();
  const translationKey = normalizePlannerTextureTranslationKey(
    fields.translationKey || fields.i18nKey || buildPlannerTextureTranslationKey(surfaceType, key)
  );

  return {
    ...fields,
    translationKey,
    name: {
      ...(fields.name || {}),
      ua: uaName,
      uk: ukName,
      en: enName,
    },
  };
};

const migrateTexture = async (texture) => {
  const { id, fields } = serializeLegacyTexture(texture);
  const surfaceType = normalizeSurfaceType(fields.surfaceType);
  if (!surfaceType) {
    return {
      status: "skipped",
      reason: `unsupported surfaceType: ${fields.surfaceType || "<empty>"}`,
      surfaceType: "",
    };
  }
  if (requestedSurfaceType && surfaceType !== requestedSurfaceType) {
    return { status: "skipped", reason: "filtered by --surface", surfaceType };
  }

  const textureModel = getPlannerTextureModel(surfaceType);
  if (!textureModel) {
    return {
      status: "skipped",
      reason: `missing model for surfaceType: ${surfaceType}`,
      surfaceType,
    };
  }

  if (dryRun) {
    return { status: "migrated", dryRun: true, id, surfaceType };
  }

  await textureModel.updateOne(
    { _id: id },
    {
      $set: {
        ...buildI18nFields({ fields, surfaceType }),
        surfaceType,
      },
      $setOnInsert: { _id: id },
    },
    { upsert: true, runValidators: true }
  );

  return { status: "migrated", id, surfaceType };
};

const backfillTargetCollection = async ([surfaceType, textureModel]) => {
  const textures = await textureModel
    .find({
      $or: [
        { translationKey: { $exists: false } },
        { translationKey: "" },
        { "name.uk": { $exists: false } },
        { "name.uk": "" },
      ],
    })
    .sort({ sortOrder: 1, key: 1 });
  let updated = 0;

  for (const texture of textures) {
    const fields = texture.toObject?.() || texture;
    const nextFields = buildI18nFields({ fields, surfaceType });

    if (dryRun) {
      updated += 1;
      continue;
    }

    await textureModel.updateOne(
      { _id: texture._id },
      {
        $set: {
          translationKey: nextFields.translationKey,
          name: nextFields.name,
        },
      },
      { runValidators: true }
    );
    updated += 1;
  }

  return { surfaceType, updated };
};

const ensurePlannerTextureIndexes = async () => {
  for (const textureModel of Object.values(PlannerTextureModels)) {
    const indexes = await textureModel.collection.indexes();
    const translationKeyIndex = indexes.find((index) => index.name === "translationKey_1");

    if (
      translationKeyIndex &&
      (!translationKeyIndex.unique || !translationKeyIndex.sparse)
    ) {
      await textureModel.collection.dropIndex("translationKey_1");
    }

    await textureModel.createIndexes();
  }
};

const main = async () => {
  if (!env.mongoUri) {
    throw new Error("MONGO_URI is required");
  }
  if (requestedSurfaceType) {
    parsePlannerTextureSurfaceType(requestedSurfaceType, "--surface");
  }

  mongoose.set("autoIndex", false);
  await mongoose.connect(env.mongoUri);
  if (!dryRun) {
    await ensurePlannerTextureIndexes();
  }

  const query = requestedSurfaceType ? { surfaceType: requestedSurfaceType } : {};
  const legacyTextures = await PlannerTexture.find(query).sort({ surfaceType: 1, sortOrder: 1, key: 1 });
  const stats = {
    total: legacyTextures.length,
    migrated: 0,
    skipped: 0,
    deletedFromSource: 0,
    backfilledTargets: 0,
    bySurface: Object.fromEntries(
      Object.keys(PLANNER_TEXTURE_SURFACE_COLLECTIONS).map((surfaceType) => [surfaceType, 0])
    ),
  };
  const migratedIds = [];

  for (const texture of legacyTextures) {
    const result = await migrateTexture(texture);
    if (result.status === "migrated") {
      stats.migrated += 1;
      stats.bySurface[result.surfaceType] += 1;
      migratedIds.push(result.id);
      continue;
    }

    stats.skipped += 1;
    console.warn(
      `Skipped planner texture ${String(texture._id || "")}: ${result.reason || "unknown reason"}`
    );
  }

  if (!dryRun && deleteSource && migratedIds.length > 0) {
    const deleteResult = await PlannerTexture.deleteMany({ _id: { $in: migratedIds } });
    stats.deletedFromSource = Number(deleteResult.deletedCount || 0);
  }

  if (backfillTargets) {
    const targetStats = await Promise.all(
      Object.entries(PlannerTextureModels).map((entry) => backfillTargetCollection(entry))
    );
    stats.backfilledTargets = targetStats.reduce((sum, item) => sum + item.updated, 0);
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        sourceCollection: PlannerTexture.collection.name,
        targetCollections: PLANNER_TEXTURE_SURFACE_COLLECTIONS,
        deleteSource,
        backfillTargets,
        stats,
      },
      null,
      2
    )
  );
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => null);
  });
