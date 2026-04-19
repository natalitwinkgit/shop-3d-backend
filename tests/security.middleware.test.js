import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeInputForSecurity } from "../app/middleware/inputSecurity.js";
import { isSafeRasterImageUpload } from "../services/uploadValidationService.js";

test("input sanitizer removes mongo operator and dotted keys", () => {
  const sanitized = sanitizeInputForSecurity({
    email: { $ne: "" },
    "profile.role": "admin",
    profile: {
      name: "<script>alert(1)</script>Alice",
      $where: "this.role === 'admin'",
      city: "Kyiv",
    },
  });

  assert.deepEqual(sanitized, {
    email: {},
    profile: {
      name: "alert(1)Alice",
      city: "Kyiv",
    },
  });
});

test("upload validation rejects svg even when mime type is image", () => {
  assert.equal(
    isSafeRasterImageUpload({
      mimetype: "image/svg+xml",
      originalname: "payload.svg",
    }),
    false
  );
  assert.equal(
    isSafeRasterImageUpload({
      mimetype: "image/png",
      originalname: "photo.png",
    }),
    true
  );
});
