import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";

import Product from "../models/Product.js";
import ProductQuestion from "../models/ProductQuestion.js";
import User from "../models/userModel.js";

let app;

test.before(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret";
  const module = await import("../app/createApp.js");
  app = module.createApp().app;
});

test("auth login returns validation error shape", async () => {
  const response = await request(app).post("/api/auth/login").send({
    email: "bad-email",
    password: "123",
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "VALIDATION_ERROR");
  assert.equal(typeof response.body.message, "string");
  assert.ok(Array.isArray(response.body.details));
  assert.equal(typeof response.body.requestId, "string");
});

test("orders preview requires auth", async () => {
  const response = await request(app).post("/api/orders/preview").send({
    items: [{ productId: "507f1f77bcf86cd799439011", qty: 1 }],
  });

  assert.equal(response.status, 401);
  assert.equal(response.body.message, "Unauthorized");
});

test("unknown API route returns unified 404 contract", async () => {
  const response = await request(app).get("/api/not-existing-route");

  assert.equal(response.status, 404);
  assert.equal(response.body.code, "API_ROUTE_NOT_FOUND");
  assert.equal(response.body.details, null);
  assert.equal(typeof response.body.requestId, "string");
});

test("chat text turn route is registered", async () => {
  const response = await request(app).post("/api/chat/text/turn").send({
    text: "столи зелені",
    mode: "text",
  });

  assert.equal(response.status, 401);
  assert.equal(response.body.code, "UNAUTHORIZED");
  assert.equal(response.body.message, "Unauthorized");
});

test("i18n missing reports are accepted as disabled no-op", async () => {
  for (let index = 0; index < 8; index += 1) {
    const response = await request(app).post("/api/i18n-missing").send({
      key: `debug.missing.${index}`,
      lang: "uk",
      defaultValue: "Missing label",
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.enabled, false);
    assert.equal(response.body.translated, false);
  }
});

test("product question route accepts current frontend payload shape", async () => {
  const productId = new mongoose.Types.ObjectId();
  const originalFindById = Product.findById;
  const originalCreate = ProductQuestion.create;
  const createdDocs = [];

  Product.findById = (id) => ({
    select() {
      assert.equal(String(id), String(productId));
      return this;
    },
    lean() {
      return Promise.resolve({
        _id: productId,
        name: { ua: "Ліжко горище Little Explorers", en: "Little Explorers Loft Bed" },
        sku: "BEDS-KIDS-LITTLE-EXPLORERS-LOFT-BED",
        slug: "little-explorers-loft-bed",
      });
    },
  });
  ProductQuestion.create = async (doc) => {
    createdDocs.push(doc);
    return { _id: new mongoose.Types.ObjectId(), ...doc };
  };

  try {
    const response = await request(app).post("/api/product-questions").send({
      productId: String(productId),
      productName: "Ліжко горище Little Explorers",
      sku: "BEDS-KIDS-LITTLE-EXPLORERS-LOFT-BED",
      pageUrl: "http://localhost:5173/catalog/beds/kids/little-explorers-loft-bed",
      name: "AI Support",
      email: "ai-support@shop3d.local",
      phone: "99822176771",
      message: "Чи є в наявності?",
      locale: "ua",
      source: "product-page",
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.ok, true);
    assert.equal(createdDocs.length, 1);
    assert.equal(createdDocs[0].customer.email, "ai-support@shop3d.local");
    assert.equal(createdDocs[0].source, "product_page");
  } finally {
    Product.findById = originalFindById;
    ProductQuestion.create = originalCreate;
  }
});

test("admin product question reply accepts answer aliases", async () => {
  const questionId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const originalFindUserById = User.findById;
  const originalFindByIdAndUpdate = ProductQuestion.findByIdAndUpdate;
  const updates = [];

  User.findById = (id) => ({
    select() {
      assert.equal(String(id), String(adminId));
      return Promise.resolve({
        _id: adminId,
        id: String(adminId),
        name: "Admin",
        email: "admin@example.com",
        role: "admin",
        status: "active",
        isOnline: true,
        lastSeen: new Date(),
      });
    },
  });

  ProductQuestion.findByIdAndUpdate = (id, update, options) => {
    assert.equal(String(id), String(questionId));
    assert.deepEqual(options, { new: true });
    updates.push(update);
    return {
      populate() {
        return this;
      },
      lean() {
        return Promise.resolve({
          _id: questionId,
          customer: { name: "Customer", email: "", phone: "+380501112233" },
          message: "Question",
          productSnapshot: { name: { ua: "Товар" }, sku: "SKU-1" },
          status: "answered",
          isRead: true,
          adminReply: {
            message: update.$set["adminReply.message"],
            emailSent: false,
            repliedAt: update.$set["adminReply.repliedAt"],
            repliedBy: adminId,
          },
        });
      },
    };
  };

  try {
    const token = jwt.sign({ id: String(adminId) }, process.env.JWT_SECRET);
    const response = await request(app)
      .post(`/api/admin/product-questions/${questionId}/reply`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        answer: "gbdsfssdfsd",
        answerText: "gbdsfssdfsd",
        replyText: "gbdsfssdfsd",
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].$set["adminReply.message"], "gbdsfssdfsd");
    assert.equal(response.body.question.adminReply.message, "gbdsfssdfsd");
  } finally {
    User.findById = originalFindUserById;
    ProductQuestion.findByIdAndUpdate = originalFindByIdAndUpdate;
  }
});
