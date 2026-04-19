import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";

import { PlannerTextureModels } from "../models/PlannerTexture.js";
import User from "../models/userModel.js";

let app;

test.before(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret";
  const module = await import("../app/createApp.js");
  app = module.createApp().app;
});

test("public planner textures route returns serialized active items", async () => {
  const originalFind = PlannerTextureModels.floor.find;

  PlannerTextureModels.floor.find = (query) => {
    assert.deepEqual(query, { isActive: { $ne: false } });
    return {
      sort(sortQuery) {
        assert.deepEqual(sortQuery, { sortOrder: 1, key: 1 });
        return {
          lean() {
            return Promise.resolve([
              {
                _id: new mongoose.Types.ObjectId("6801d7c7c21d5b65bbf54001"),
                key: "oak-light",
                slug: "oak-light",
                name: { ua: "Дуб світлий", en: "Light oak" },
                surfaceType: "floor",
                textureUrl: "https://cdn.example.com/floor/oak-light.jpg",
                previewUrl: "https://cdn.example.com/floor/oak-light-preview.jpg",
                repeat: { x: 2, y: 2 },
                isSeamless: true,
                sortOrder: 10,
                isActive: true,
              },
            ]);
          },
        };
      },
    };
  };

  try {
    const response = await request(app).get("/api/planner-textures?surfaceType=floor");

    assert.equal(response.status, 200);
    assert.equal(Array.isArray(response.body.items), true);
    assert.equal(response.body.items.length, 1);
    assert.equal(response.body.items[0].surfaceType, "floor");
    assert.equal(response.body.items[0].textureUrl, "https://cdn.example.com/floor/oak-light.jpg");
    assert.equal(response.body.items[0].translationKey, "planner.textures.floor.oak-light");
    assert.equal(response.body.items[0].name.uk, "Дуб світлий");
    assert.equal(response.body.items[0].repeat.x, 2);
  } finally {
    PlannerTextureModels.floor.find = originalFind;
  }
});

test("public planner textures grouped route separates floor wall and door", async () => {
  const originalFinds = {
    floor: PlannerTextureModels.floor.find,
    wall: PlannerTextureModels.wall.find,
    door: PlannerTextureModels.door.find,
  };

  const mockSurfaceFind = (surfaceType, item) => (query) => {
    assert.deepEqual(query, { isActive: { $ne: false } });
    return {
      sort(sortQuery) {
        assert.deepEqual(sortQuery, { sortOrder: 1, key: 1 });
        return {
          lean() {
            return Promise.resolve([
              {
                _id: new mongoose.Types.ObjectId(),
                key: item.key,
                slug: item.slug,
                name: item.name,
                surfaceType,
                textureUrl: item.textureUrl,
              },
            ]);
          },
        };
      },
    };
  };

  PlannerTextureModels.floor.find = mockSurfaceFind("floor", {
    key: "oak-floor",
    slug: "oak-floor",
    name: { ua: "Підлога", en: "Floor" },
    textureUrl: "https://cdn.example.com/floor.jpg",
  });
  PlannerTextureModels.wall.find = mockSurfaceFind("wall", {
    key: "white-wall",
    slug: "white-wall",
    name: { ua: "Стіна", en: "Wall" },
    textureUrl: "https://cdn.example.com/wall.jpg",
  });
  PlannerTextureModels.door.find = mockSurfaceFind("door", {
    key: "door-walnut",
    slug: "door-walnut",
    name: { ua: "Двері", en: "Door" },
    textureUrl: "https://cdn.example.com/door.jpg",
  });

  try {
    const response = await request(app).get("/api/planner-textures/grouped");

    assert.equal(response.status, 200);
    assert.equal(response.body.surfaces.floor.length, 1);
    assert.equal(response.body.surfaces.wall.length, 1);
    assert.equal(response.body.surfaces.door.length, 1);
    assert.equal(response.body.surfaces.wall[0].surfaceType, "wall");
  } finally {
    PlannerTextureModels.floor.find = originalFinds.floor;
    PlannerTextureModels.wall.find = originalFinds.wall;
    PlannerTextureModels.door.find = originalFinds.door;
  }
});

test("admin planner texture create validates payload", async () => {
  const adminId = new mongoose.Types.ObjectId();
  const originalFindUserById = User.findById;

  User.findById = (id) => ({
    select() {
      assert.equal(String(id), String(adminId));
      return Promise.resolve({
        _id: adminId,
        id: String(adminId),
        email: "admin@example.com",
        role: "admin",
        status: "active",
        isOnline: true,
        lastSeen: new Date(),
      });
    },
  });

  try {
    const token = jwt.sign({ id: String(adminId) }, process.env.JWT_SECRET);
    const response = await request(app)
      .post("/api/admin/planner-textures")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: { ua: "Тест", en: "Test" },
        surfaceType: "ceiling",
        textureUrl: "https://cdn.example.com/invalid.jpg",
      });

    assert.equal(response.status, 400);
    assert.match(String(response.body.message || ""), /surfaceType/i);
  } finally {
    User.findById = originalFindUserById;
  }
});

test("admin planner texture create accepts json payload", async () => {
  const adminId = new mongoose.Types.ObjectId();
  const createdId = new mongoose.Types.ObjectId();
  const originalFindUserById = User.findById;
  const originalCreate = PlannerTextureModels.floor.create;

  User.findById = (id) => ({
    select() {
      assert.equal(String(id), String(adminId));
      return Promise.resolve({
        _id: adminId,
        id: String(adminId),
        email: "admin@example.com",
        role: "admin",
        status: "active",
        isOnline: true,
        lastSeen: new Date(),
      });
    },
  });

  PlannerTextureModels.floor.create = async (payload) => ({
    toObject() {
      return {
        _id: createdId,
        ...payload,
        previewUrl: payload.previewUrl || payload.textureUrl,
        repeat: payload.repeat || { x: 1, y: 1 },
        isSeamless: payload.isSeamless ?? true,
        isActive: payload.isActive ?? true,
        sortOrder: payload.sortOrder ?? 0,
      };
    },
  });

  try {
    const token = jwt.sign({ id: String(adminId) }, process.env.JWT_SECRET);
    const response = await request(app)
      .post("/api/admin/planner-textures")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: { uk: "Дуб", en: "Oak" },
        i18nKey: "Planner.Textures.Floor.CustomOak",
        surfaceType: "floor",
        textureUrl: "https://cdn.example.com/floor/oak.jpg",
        sortOrder: 5,
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.id, String(createdId));
    assert.equal(response.body.translationKey, "planner.textures.floor.customoak");
    assert.equal(response.body.i18nKey, "planner.textures.floor.customoak");
    assert.equal(response.body.name.ua, "Дуб");
    assert.equal(response.body.name.uk, "Дуб");
    assert.equal(response.body.textureUrl, "https://cdn.example.com/floor/oak.jpg");
    assert.equal(response.body.surfaceType, "floor");
    assert.equal(response.body.previewUrl, "https://cdn.example.com/floor/oak.jpg");
  } finally {
    User.findById = originalFindUserById;
    PlannerTextureModels.floor.create = originalCreate;
  }
});

test("admin planner texture updates only texture fields separately", async () => {
  const adminId = new mongoose.Types.ObjectId();
  const textureId = new mongoose.Types.ObjectId();
  const originalFindUserById = User.findById;
  const originalFloorFindOne = PlannerTextureModels.floor.findOne;
  const originalWallFindOne = PlannerTextureModels.wall.findOne;
  const originalDoorFindOne = PlannerTextureModels.door.findOne;
  const originalFindByIdAndUpdate = PlannerTextureModels.floor.findByIdAndUpdate;

  User.findById = (id) => ({
    select() {
      assert.equal(String(id), String(adminId));
      return Promise.resolve({
        _id: adminId,
        id: String(adminId),
        email: "admin@example.com",
        role: "admin",
        status: "active",
        isOnline: true,
        lastSeen: new Date(),
      });
    },
  });

  PlannerTextureModels.floor.findOne = async (query) => {
    assert.equal(String(query.$or[0]._id), String(textureId));
    return {
      _id: textureId,
      key: "oak-floor",
      slug: "oak-floor",
      name: { ua: "Дуб", en: "Oak" },
      surfaceType: "floor",
      textureUrl: "https://cdn.example.com/old-floor.jpg",
      previewUrl: "https://cdn.example.com/old-floor-preview.jpg",
      cloudinaryPublicId: "planner/floor/old-floor",
      toObject() {
        return this;
      },
    };
  };
  PlannerTextureModels.wall.findOne = async () => null;
  PlannerTextureModels.door.findOne = async () => null;

  PlannerTextureModels.floor.findByIdAndUpdate = async (id, payload, options) => {
    assert.equal(String(id), String(textureId));
    assert.deepEqual(options, { new: true, runValidators: true });
    assert.equal(payload.textureUrl, "https://cdn.example.com/new-floor.jpg");
    assert.equal(payload.previewUrl, "https://cdn.example.com/new-floor-preview.jpg");
    assert.equal(payload.key, undefined);
    return {
      toObject() {
        return {
          _id: textureId,
          key: "oak-floor",
          slug: "oak-floor",
          name: { ua: "Дуб", en: "Oak" },
          surfaceType: "floor",
          textureUrl: payload.textureUrl,
          previewUrl: payload.previewUrl,
          repeat: { x: 1, y: 1 },
          isSeamless: true,
          isActive: true,
          sortOrder: 0,
        };
      },
    };
  };

  try {
    const token = jwt.sign({ id: String(adminId) }, process.env.JWT_SECRET);
    const response = await request(app)
      .patch(`/api/admin/planner-textures/${textureId}/texture`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        textureUrl: "https://cdn.example.com/new-floor.jpg",
        previewUrl: "https://cdn.example.com/new-floor-preview.jpg",
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.textureUrl, "https://cdn.example.com/new-floor.jpg");
    assert.equal(response.body.previewUrl, "https://cdn.example.com/new-floor-preview.jpg");
    assert.equal(response.body.surfaceType, "floor");
  } finally {
    User.findById = originalFindUserById;
    PlannerTextureModels.floor.findOne = originalFloorFindOne;
    PlannerTextureModels.wall.findOne = originalWallFindOne;
    PlannerTextureModels.door.findOne = originalDoorFindOne;
    PlannerTextureModels.floor.findByIdAndUpdate = originalFindByIdAndUpdate;
  }
});
