import mongoose from "mongoose";

import "../config/env.js";
import { env } from "../config/env.js";
import { PlannerTextureModels } from "../models/PlannerTexture.js";

const args = new Set(process.argv.slice(2));
const clearMock = args.has("--clear-mock");

const PLACEHOLDER_BASE_URL = "https://placehold.co";

const buildPlaceholderUrl = ({ size = 1024, bg, fg = "ffffff", text }) =>
  `${PLACEHOLDER_BASE_URL}/${size}x${size}/${bg}/${fg}.jpg?text=${encodeURIComponent(text)}`;

const buildTexture = ({
  surfaceType,
  key,
  uk,
  en,
  bg,
  fg = "ffffff",
  sortOrder,
  repeat = { x: 1, y: 1 },
}) => ({
  key,
  slug: key,
  translationKey: `planner.textures.${surfaceType}.${key}`,
  name: {
    ua: uk,
    uk,
    en,
  },
  surfaceType,
  textureUrl: buildPlaceholderUrl({ bg, fg, text: `${surfaceType} ${en}` }),
  previewUrl: buildPlaceholderUrl({ size: 512, bg, fg, text: en }),
  mimeType: "image/jpeg",
  width: 1024,
  height: 1024,
  isSeamless: true,
  repeat,
  normalMapUrl: "",
  roughnessMapUrl: "",
  aoMapUrl: "",
  metalnessMapUrl: "",
  sortOrder,
  isActive: true,
});

const mockTextures = [
  buildTexture({
    surfaceType: "floor",
    key: "mock-floor-light-oak",
    uk: "Світлий дуб",
    en: "Light oak",
    bg: "b68b55",
    sortOrder: 10,
    repeat: { x: 2, y: 2 },
  }),
  buildTexture({
    surfaceType: "floor",
    key: "mock-floor-walnut",
    uk: "Горіх",
    en: "Walnut",
    bg: "6b4328",
    sortOrder: 20,
    repeat: { x: 2, y: 2 },
  }),
  buildTexture({
    surfaceType: "floor",
    key: "mock-floor-concrete",
    uk: "Сірий бетон",
    en: "Grey concrete",
    bg: "8f9491",
    sortOrder: 30,
    repeat: { x: 3, y: 3 },
  }),
  buildTexture({
    surfaceType: "floor",
    key: "mock-floor-dark-stone",
    uk: "Темний камінь",
    en: "Dark stone",
    bg: "343a40",
    sortOrder: 40,
    repeat: { x: 3, y: 3 },
  }),
  buildTexture({
    surfaceType: "wall",
    key: "mock-wall-warm-plaster",
    uk: "Тепла штукатурка",
    en: "Warm plaster",
    bg: "d8c3a5",
    sortOrder: 10,
    repeat: { x: 1, y: 1 },
  }),
  buildTexture({
    surfaceType: "wall",
    key: "mock-wall-white-matte",
    uk: "Білий матовий",
    en: "Matte white",
    bg: "f2efe7",
    fg: "333333",
    sortOrder: 20,
    repeat: { x: 1, y: 1 },
  }),
  buildTexture({
    surfaceType: "wall",
    key: "mock-wall-sage",
    uk: "Шавлія",
    en: "Sage",
    bg: "8a9a83",
    sortOrder: 30,
    repeat: { x: 1, y: 1 },
  }),
  buildTexture({
    surfaceType: "wall",
    key: "mock-wall-charcoal",
    uk: "Графіт",
    en: "Charcoal",
    bg: "30343b",
    sortOrder: 40,
    repeat: { x: 1, y: 1 },
  }),
  buildTexture({
    surfaceType: "door",
    key: "mock-door-natural-oak",
    uk: "Натуральний дуб",
    en: "Natural oak",
    bg: "a8753b",
    sortOrder: 10,
    repeat: { x: 1, y: 1 },
  }),
  buildTexture({
    surfaceType: "door",
    key: "mock-door-white-ash",
    uk: "Білий ясен",
    en: "White ash",
    bg: "e8e1d4",
    fg: "333333",
    sortOrder: 20,
    repeat: { x: 1, y: 1 },
  }),
  buildTexture({
    surfaceType: "door",
    key: "mock-door-dark-wenge",
    uk: "Темне венге",
    en: "Dark wenge",
    bg: "30251f",
    sortOrder: 30,
    repeat: { x: 1, y: 1 },
  }),
  buildTexture({
    surfaceType: "door",
    key: "mock-door-graphite",
    uk: "Графітові двері",
    en: "Graphite door",
    bg: "4a4f55",
    sortOrder: 40,
    repeat: { x: 1, y: 1 },
  }),
];

const seedSurfaceTextures = async (surfaceType) => {
  const textureModel = PlannerTextureModels[surfaceType];
  const items = mockTextures.filter((item) => item.surfaceType === surfaceType);

  await textureModel.createIndexes();

  if (clearMock) {
    await textureModel.deleteMany({ key: /^mock-/ });
  }

  if (items.length === 0) return { surfaceType, upserted: 0, modified: 0 };

  const result = await textureModel.bulkWrite(
    items.map((item) => ({
      updateOne: {
        filter: { key: item.key },
        update: {
          $set: item,
          $unset: { cloudinaryPublicId: "" },
        },
        upsert: true,
      },
    })),
    { ordered: true }
  );

  return {
    surfaceType,
    upserted: Number(result.upsertedCount || 0),
    modified: Number(result.modifiedCount || 0),
    matched: Number(result.matchedCount || 0),
  };
};

const main = async () => {
  if (!env.mongoUri) {
    throw new Error("MONGO_URI is required");
  }

  await mongoose.connect(env.mongoUri);

  const results = [];
  for (const surfaceType of ["floor", "wall", "door"]) {
    results.push(await seedSurfaceTextures(surfaceType));
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        clearMock,
        totalMockItems: mockTextures.length,
        results,
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
