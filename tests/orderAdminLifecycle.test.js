import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import {
  adminDeleteOrder,
  adminUpdateOrderStatus,
} from "../controllers/orderController.js";
import Order from "../models/Order.js";
import Translation from "../models/Translation.js";
import User from "../models/userModel.js";

const queryResult = (value) => ({
  populate() {
    return this;
  },
  select() {
    return this;
  },
  lean() {
    return Promise.resolve(value);
  },
});

const createMockResponse = () => {
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  return response;
};

test("admin order status update stores status history", async () => {
  const orderId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const originalFindById = Order.findById;
  const originalFindByIdAndUpdate = Order.findByIdAndUpdate;
  const originalUserFindById = User.findById;
  const originalTranslationFindOne = Translation.findOne;
  let capturedUpdate = null;

  Order.findById = () =>
    queryResult({
      _id: orderId,
      user: userId,
      status: "new",
      appliedReward: {},
      deletedAt: null,
    });

  Order.findByIdAndUpdate = (id, update, options) => {
    assert.equal(String(id), String(orderId));
    assert.deepEqual(options, { new: true });
    capturedUpdate = update;
    return queryResult({
      _id: orderId,
      user: { _id: userId, email: "customer@example.com" },
      customer: { fullName: "Customer", phone: "+380991112233", email: "customer@example.com" },
      delivery: { city: "Kyiv", method: "pickup" },
      items: [],
      totals: { subtotal: 100, cartTotal: 100 },
      status: update.$set.status,
      adminNote: "",
      scheduledAt: null,
      statusHistory: [update.$push.statusHistory],
      deletedAt: null,
    });
  };

  User.findById = async () => null;
  Translation.findOne = () => queryResult(null);

  try {
    const response = createMockResponse();
    await adminUpdateOrderStatus(
      {
        params: { id: String(orderId) },
        query: {},
        headers: {},
        body: { status: "processing", note: "Packed" },
        user: { _id: adminId, role: "admin" },
      },
      response
    );

    assert.equal(response.statusCode, 200);
    assert.equal(capturedUpdate.$set.status, "processing");
    assert.equal(capturedUpdate.$set.cancelledAt, null);
    assert.equal(capturedUpdate.$push.statusHistory.status, "processing");
    assert.equal(capturedUpdate.$push.statusHistory.note, "Packed");
    assert.equal(String(capturedUpdate.$push.statusHistory.changedBy), String(adminId));
    assert.equal(response.body.status, "processing");
    assert.equal(response.body.admin.note, "");
  } finally {
    Order.findById = originalFindById;
    Order.findByIdAndUpdate = originalFindByIdAndUpdate;
    User.findById = originalUserFindById;
    Translation.findOne = originalTranslationFindOne;
  }
});

test("admin order delete soft deletes and unlinks order from user", async () => {
  const orderId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const originalFindById = Order.findById;
  const originalFindByIdAndUpdate = Order.findByIdAndUpdate;
  const originalUserUpdateOne = User.updateOne;
  const originalUserFindById = User.findById;
  const originalTranslationFindOne = Translation.findOne;
  let capturedUpdate = null;
  let capturedUserUpdate = null;

  Order.findById = () =>
    queryResult({
      _id: orderId,
      user: userId,
      status: "confirmed",
      appliedReward: {},
      deletedAt: null,
    });

  Order.findByIdAndUpdate = (id, update, options) => {
    assert.equal(String(id), String(orderId));
    assert.deepEqual(options, { new: true });
    capturedUpdate = update;
    return queryResult({
      _id: orderId,
      user: { _id: userId, email: "customer@example.com" },
      customer: { fullName: "Customer", phone: "+380991112233", email: "customer@example.com" },
      delivery: { city: "Kyiv", method: "pickup" },
      items: [],
      totals: { subtotal: 100, cartTotal: 100 },
      status: "confirmed",
      adminNote: "",
      scheduledAt: null,
      deletedAt: update.$set.deletedAt,
      deletedBy: adminId,
      deletedReason: update.$set.deletedReason,
    });
  };

  User.updateOne = async (filter, update) => {
    capturedUserUpdate = { filter, update };
    return { modifiedCount: 1 };
  };
  User.findById = async () => null;
  Translation.findOne = () => queryResult(null);

  try {
    const response = createMockResponse();
    await adminDeleteOrder(
      {
        params: { id: String(orderId) },
        query: {},
        headers: {},
        body: { reason: "Duplicate" },
        user: { _id: adminId, role: "admin" },
      },
      response
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.deleted, true);
    assert.ok(capturedUpdate.$set.deletedAt instanceof Date);
    assert.equal(String(capturedUpdate.$set.deletedBy), String(adminId));
    assert.equal(capturedUpdate.$set.deletedReason, "Duplicate");
    assert.equal(capturedUpdate.$push.statusHistory.note, "Duplicate");
    assert.deepEqual(capturedUserUpdate.filter, { _id: userId });
    assert.deepEqual(capturedUserUpdate.update, { $pull: { orders: orderId } });
  } finally {
    Order.findById = originalFindById;
    Order.findByIdAndUpdate = originalFindByIdAndUpdate;
    User.updateOne = originalUserUpdateOne;
    User.findById = originalUserFindById;
    Translation.findOne = originalTranslationFindOne;
  }
});
