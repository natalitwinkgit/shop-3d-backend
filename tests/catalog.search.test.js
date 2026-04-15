import assert from "node:assert/strict";
import test from "node:test";

import { buildCatalogReply, isCatalogProductQuery } from "../services/catalogSearchService.js";

test("catalog queries detect color and product intent", () => {
  assert.equal(isCatalogProductQuery("розове крісло"), true);
  assert.equal(isCatalogProductQuery("покажи рожевий диван до 60000"), true);
  assert.equal(isCatalogProductQuery("привіт, як справи?"), false);
});

test("catalog reply renders verified product data", () => {
  const reply = buildCatalogReply({
    query: "розове крісло",
    colorKeys: ["pink"],
    items: [
      {
        title: "Teddy Lounge Chair",
        slug: "teddy-lounge-chair",
        finalPrice: 15999,
        storefrontUrl: "/products/teddy-lounge-chair",
        inStock: true,
        matchedColorKeys: ["pink"],
        primaryColor: {
          key: "pink",
          name: { ua: "Рожевий", en: "Pink" },
        },
        colors: [
          {
            key: "pink",
            name: { ua: "Рожевий", en: "Pink" },
          },
        ],
      },
    ],
  });

  assert.match(reply, /Teddy Lounge Chair/);
  assert.match(reply, /Рожевий/);
  assert.match(reply, /15\s?999/);
  assert.doesNotMatch(reply, /\/products\/teddy-lounge-chair/);
  assert.doesNotMatch(reply, /\n2\./);
});

test("catalog reply keeps only the strongest match when multiple items exist", () => {
  const reply = buildCatalogReply({
    query: "дитяче ліжко",
    items: [
      {
        title: "Дитяче ліжко Orion",
        slug: "orion-bed",
        finalPrice: 12000,
        inStock: true,
      },
      {
        title: "Дитяче ліжко Luna",
        slug: "luna-bed",
        finalPrice: 13000,
        inStock: true,
      },
    ],
  });

  assert.match(reply, /Дитяче ліжко Orion/);
  assert.doesNotMatch(reply, /Дитяче ліжко Luna/);
  assert.doesNotMatch(reply, /\n2\./);
});
