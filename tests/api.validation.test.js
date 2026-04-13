import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";

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
