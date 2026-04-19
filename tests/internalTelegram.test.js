import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import request from "supertest";

import UserAddress from "../models/UserAddress.js";
import User from "../models/userModel.js";

let app;

test.before(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret";
  process.env.WEBSITE_INTERNAL_API_KEY =
    process.env.WEBSITE_INTERNAL_API_KEY || "test_internal_api_key";
  const module = await import("../app/createApp.js");
  app = module.createApp().app;
});

test("internal telegram lookup resolves ukrainian phone variants", async () => {
  const originalFindOne = User.findOne;
  const userId = new mongoose.Types.ObjectId("6801d7c7c21d5b65bbf54011");

  User.findOne = (query) => ({
    select(projection) {
      assert.equal(projection, "-passwordHash -password");
      assert.deepEqual(query.status, { $ne: "banned" });

      const variants = new Set(
        (query.$or || []).flatMap((condition) => [
          ...(condition.phoneNormalized?.$in || []),
          ...(condition.phone?.$in || []),
        ])
      );

      assert.ok(variants.has("982995094"));
      assert.ok(variants.has("0982995094"));
      assert.ok(variants.has("380982995094"));
      assert.ok(variants.has("+380982995094"));

      return Promise.resolve({
        _id: userId,
        name: "Nata",
        email: "nata@example.com",
        phone: "+380982995094",
      });
    },
  });

  try {
    const response = await request(app)
      .post("/api/internal/telegram/users/resolve-by-phone")
      .set("X-Internal-Api-Key", process.env.WEBSITE_INTERNAL_API_KEY)
      .send({ phone: "98 299 50 94" });

    assert.equal(response.status, 200);
    assert.equal(response.body.websiteUserId, String(userId));
    assert.deepEqual(response.body.userPreview, {
      name: "Nata",
      email: "nata@example.com",
      phone: "+380982995094",
    });
  } finally {
    User.findOne = originalFindOne;
  }
});

test("internal telegram phone update stores telegram contact phone on website user", async () => {
  const originalFindOne = User.findOne;
  const userId = new mongoose.Types.ObjectId("6801d7c7c21d5b65bbf54012");
  let callCount = 0;

  const user = {
    _id: userId,
    name: "Nata",
    email: "nata@example.com",
    phone: "+380501112233",
    phoneNormalized: "+380501112233",
    async save() {
      assert.equal(this.phone, "+380968111758");
      assert.equal(this.phoneNormalized, "+380968111758");
      return this;
    },
  };

  User.findOne = (query) => ({
    select(projection) {
      callCount += 1;

      if (callCount === 1) {
        assert.equal(projection, "-passwordHash -password");
        assert.deepEqual(query._id, String(userId));
        assert.deepEqual(query.status, { $ne: "banned" });
        return Promise.resolve(user);
      }

      assert.equal(projection, "_id");
      assert.deepEqual(query._id, { $ne: userId });
      const variants = new Set(
        (query.$or || []).flatMap((condition) => [
          ...(condition.phoneNormalized?.$in || []),
          ...(condition.phone?.$in || []),
        ])
      );
      assert.ok(variants.has("+380968111758"));
      assert.ok(variants.has("380968111758"));
      assert.ok(variants.has("0968111758"));
      return Promise.resolve(null);
    },
  });

  try {
    const response = await request(app)
      .patch(`/api/internal/telegram/users/${String(userId)}/phone-from-telegram`)
      .set("X-Internal-Api-Key", process.env.WEBSITE_INTERNAL_API_KEY)
      .send({ phone: "380 96 811 17 58" });

    assert.equal(response.status, 200);
    assert.equal(response.body.websiteUserId, String(userId));
    assert.deepEqual(response.body.userPreview, {
      name: "Nata",
      email: "nata@example.com",
      phone: "+380968111758",
    });
  } finally {
    User.findOne = originalFindOne;
  }
});

test("internal telegram addresses returns delivery addresses for bot", async () => {
  const originalFindOne = User.findOne;
  const originalAddressFind = UserAddress.find;
  const userId = new mongoose.Types.ObjectId("6801d7c7c21d5b65bbf54013");

  User.findOne = (query) => ({
    select(projection) {
      assert.equal(projection, "-passwordHash -password");
      assert.deepEqual(query._id, String(userId));
      assert.deepEqual(query.status, { $ne: "banned" });
      return Promise.resolve({
        _id: userId,
        addresses: [],
      });
    },
  });

  UserAddress.find = (query) => {
    assert.deepEqual(query.user, userId);
    return {
      sort(sortSpec) {
        assert.deepEqual(sortSpec, { sortOrder: 1, createdAt: 1 });
        return {
          lean() {
            return Promise.resolve([
              {
                _id: new mongoose.Types.ObjectId("6801d7c7c21d5b65bbf54014"),
                label: "Home",
                city: "Київ",
                addressLine: "Хрещатик 1",
                comment: "Після 18:00",
                isPrimary: true,
              },
            ]);
          },
        };
      },
    };
  };

  try {
    const response = await request(app)
      .get(`/api/internal/telegram/users/${String(userId)}/addresses`)
      .set("X-Internal-Api-Key", process.env.WEBSITE_INTERNAL_API_KEY);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.addresses, [
      {
        id: "6801d7c7c21d5b65bbf54014",
        label: "Home",
        city: "Київ",
        addressLine: "Хрещатик 1",
        comment: "Після 18:00",
        isPrimary: true,
      },
    ]);
  } finally {
    User.findOne = originalFindOne;
    UserAddress.find = originalAddressFind;
  }
});
