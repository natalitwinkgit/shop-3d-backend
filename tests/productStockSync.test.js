import assert from "node:assert/strict";
import test from "node:test";

import { summarizeInventoryRows } from "../services/productStockSyncService.js";

test("inventory stock summary uses available quantity per location row", () => {
  const summary = summarizeInventoryRows([
    { onHand: 5, reserved: 2 },
    { onHand: 1, reserved: 0 },
    { onHand: 2, reserved: 5 },
  ]);

  assert.equal(summary.rows, 3);
  assert.equal(summary.onHand, 8);
  assert.equal(summary.reserved, 7);
  assert.equal(summary.stockQty, 4);
  assert.equal(summary.available, 4);
  assert.equal(summary.inStock, true);
});

test("inventory stock summary marks product out of stock with no available rows", () => {
  const summary = summarizeInventoryRows([
    { onHand: 0, reserved: 0 },
    { onHand: 3, reserved: 3 },
  ]);

  assert.equal(summary.stockQty, 0);
  assert.equal(summary.inStock, false);
});
