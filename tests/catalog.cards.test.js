import assert from "node:assert/strict";
import test from "node:test";

import { buildCatalogReply } from "../services/catalogSearchService.js";
import { buildProductCards } from "../services/catalogProductCardService.js";

test("catalog replies do not include raw storefront links", () => {
  const reply = buildCatalogReply({
    items: [
      {
        title: 'Крісло ігрове "Sakura Gaming Pro"',
        slug: "sakura-gaming-pro-chair",
        finalPrice: 20615,
        inStock: true,
        primaryColor: {
          key: "blue",
          name: { ua: "Середній синій" },
        },
      },
    ],
  });

  assert.equal(reply.includes("Посилання:"), false);
  assert.ok(reply.includes("найкращий варіант"));
  assert.ok(reply.includes('Крісло ігрове "Sakura Gaming Pro"'));
  assert.equal(reply.includes("\n2."), false);
});

test("product cards expose a clickable storefront url", () => {
  const cards = buildProductCards([
    {
      slug: "sakura-gaming-pro-chair",
      title: 'Крісло ігрове "Sakura Gaming Pro"',
      price: 20615,
      finalPrice: 20615,
      image: "https://cdn.example.com/chair.jpg",
      inStock: true,
    },
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].slug, "sakura-gaming-pro-chair");
  assert.ok(cards[0].storefrontUrl.endsWith("/products/sakura-gaming-pro-chair"));
  assert.equal(cards[0].title, 'Крісло ігрове "Sakura Gaming Pro"');
  assert.equal(cards[0].currency, "UAH");
});

test("product cards default to the best single match", () => {
  const cards = buildProductCards([
    {
      slug: "first-match",
      title: "First Match",
      price: 1000,
      finalPrice: 1000,
      inStock: true,
    },
    {
      slug: "second-match",
      title: "Second Match",
      price: 2000,
      finalPrice: 2000,
      inStock: true,
    },
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].slug, "first-match");
  assert.equal(cards[0].title, "First Match");
});
