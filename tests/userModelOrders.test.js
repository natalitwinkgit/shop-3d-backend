import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import User from "../models/userModel.js";

test("user orders stores order references without embedded order validation", () => {
  const orderId = new mongoose.Types.ObjectId();
  const user = new User({
    email: "orders-schema@example.com",
    orders: [orderId],
  });

  const error = user.validateSync();

  assert.equal(error, undefined);
  assert.equal(String(user.orders[0]), String(orderId));
});
