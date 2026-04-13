import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCollectionKeys, normalizeStyleKeys } from "../services/catalogNormalizationService.js";
import { buildProductMutationPayload } from "../services/productPayloadService.js";

test("product style and collection keys are normalized", () => {
  assert.deepEqual(normalizeStyleKeys(["Modern Soft", "modern-soft", "  urban  "]), [
    "modern_soft",
    "urban",
  ]);
  assert.deepEqual(normalizeCollectionKeys(["Luna Bedroom", "luna-bedroom"]), [
    "luna_bedroom",
  ]);
});

test("product mutation payload normalizes attribute key arrays", () => {
  const payload = buildProductMutationPayload({
    body: {
      name: { ua: "Тестовий товар", en: "Test product" },
      category: "chairs",
      price: 100,
      styleKeys: ["Modern Soft", "modern-soft"],
      collectionKeys: ["Luna Bedroom"],
      roomKeys: ["living-room"],
    },
    partial: false,
    allowInventoryFields: true,
  });

  assert.deepEqual(payload.styleKeys, ["modern_soft"]);
  assert.deepEqual(payload.collectionKeys, ["luna_bedroom"]);
  assert.deepEqual(payload.roomKeys, ["living_room"]);
});
