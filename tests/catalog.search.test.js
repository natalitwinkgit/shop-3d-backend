import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCatalogReply,
  isCatalogProductQuery,
  rankCatalogProducts,
} from "../services/catalogSearchService.js";

test("catalog queries detect color and product intent", () => {
  assert.equal(isCatalogProductQuery("розове крісло"), true);
  assert.equal(isCatalogProductQuery("покажи рожевий диван до 60000"), true);
  assert.equal(isCatalogProductQuery("садова меблі для пікніка"), true);
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

test("catalog ranking prefers outdoor picnic furniture over office desks", () => {
  const ranked = rankCatalogProducts(
    [
      {
        title: "Письмовий стіл Loft Apex",
        slug: "loft-apex",
        category: "tables",
        subCategory: "office",
        typeKey: "desk",
        description: {
          ua: "Сучасний письмовий стіл для роботи вдома.",
          en: "Modern office desk for home work.",
        },
        roomKeys: ["home_office"],
        collectionKeys: ["office"],
        featureKeys: ["work"],
        inStock: true,
        updatedAt: "2026-04-15T10:00:00.000Z",
      },
      {
        title: "Стіл для пікніка Heritage Garden",
        slug: "picnic-table",
        category: "tables",
        subCategory: "outdoor",
        typeKey: "garden-table",
        description: {
          ua: "Садовий стіл для пікніка та відпочинку на відкритому повітрі.",
          en: "Outdoor picnic table for garden seating.",
        },
        roomKeys: ["outdoor"],
        collectionKeys: ["garden"],
        featureKeys: ["picnic"],
        inStock: true,
        updatedAt: "2026-04-14T10:00:00.000Z",
      },
    ],
    {
      query: "столи для пікніка типу садової мебелі",
      categoryKeys: ["tables"],
      colorKeys: [],
      minPrice: null,
      maxPrice: null,
    }
  );

  assert.equal(ranked[0].slug, "picnic-table");
  assert.equal(ranked[0].title, "Стіл для пікніка Heritage Garden");
  assert.ok(ranked[0].matchScore > ranked[1].matchScore);
});
