import assert from "node:assert/strict";
import test from "node:test";

import { pickFallbackColorKeys } from "../services/productColorAssignmentService.js";

test("fallback color selection is stable and uses known color keys", () => {
  const first = pickFallbackColorKeys({
    slug: "nordic-lounge-chair",
    availableColorKeys: ["cream", "graphite", "pink"],
  });
  const second = pickFallbackColorKeys({
    slug: "nordic-lounge-chair",
    availableColorKeys: ["cream", "graphite", "pink"],
  });

  assert.equal(first.length, 1);
  assert.deepEqual(first, second);
  assert.ok(["cream", "graphite", "pink"].includes(first[0]));
});
