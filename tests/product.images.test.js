import assert from "node:assert/strict";
import test from "node:test";

import { buildProductMutationPayload } from "../services/productPayloadService.js";

const baseProductBody = () => ({
  name: { ua: "Тестовий товар", en: "Test product" },
  category: "chairs",
  price: 100,
});

test("product payload accepts numbered image URL fields", () => {
  const payload = buildProductMutationPayload({
    body: {
      ...baseProductBody(),
      imageUrl1: "https://cdn.example.com/product-1.jpg",
      imageUrl2: "https://cdn.example.com/product-2.jpg",
      imageUrl3: "https://cdn.example.com/product-3.jpg",
    },
    partial: false,
    allowInventoryFields: true,
  });

  assert.equal(payload.previewImage, "https://cdn.example.com/product-1.jpg");
  assert.deepEqual(payload.images, [
    "https://cdn.example.com/product-1.jpg",
    "https://cdn.example.com/product-2.jpg",
    "https://cdn.example.com/product-3.jpg",
  ]);
});

test("product payload uses imageUrl as preview and imageUrl2 as gallery image", () => {
  const payload = buildProductMutationPayload({
    body: {
      ...baseProductBody(),
      imageUrl: "https://cdn.example.com/preview.jpg",
      imageUrl2: "https://cdn.example.com/side.jpg",
    },
    partial: false,
    allowInventoryFields: true,
  });

  assert.equal(payload.previewImage, "https://cdn.example.com/preview.jpg");
  assert.deepEqual(payload.images, [
    "https://cdn.example.com/preview.jpg",
    "https://cdn.example.com/side.jpg",
  ]);
});

test("product payload rejects more than 10 product images", () => {
  assert.throws(
    () =>
      buildProductMutationPayload({
        body: {
          ...baseProductBody(),
          imageUrls: Array.from(
            { length: 11 },
            (_, index) => `https://cdn.example.com/product-${index + 1}.jpg`
          ),
        },
        partial: false,
        allowInventoryFields: true,
      }),
    /images must contain at most 10 items/
  );
});

test("product payload rejects numbered image fields above 10", () => {
  assert.throws(
    () =>
      buildProductMutationPayload({
        body: {
          ...baseProductBody(),
          imageUrl11: "https://cdn.example.com/product-11.jpg",
        },
        partial: false,
        allowInventoryFields: true,
      }),
    /numbered image URL fields support only 1-10/
  );
});
