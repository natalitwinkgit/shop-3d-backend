import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import LoyaltyCard from "../models/LoyaltyCard.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import { buildLoyaltyCardNumber } from "../services/loyaltyService.js";

test("loyalty card stores one user-linked discount card snapshot", () => {
  const userId = new mongoose.Types.ObjectId();
  const card = new LoyaltyCard({
    user: userId,
    cardNumber: buildLoyaltyCardNumber(userId),
    tier: "silver",
    baseDiscountPct: 3,
    bonusBalance: 120,
    totalEarned: 200,
    totalRedeemed: 80,
    totalSpent: 22000,
    completedOrders: 3,
  });

  const error = card.validateSync();

  assert.equal(error, undefined);
  assert.equal(card.cardNumber, `DC-${String(userId).slice(-8).toUpperCase()}`);
  assert.equal(card.tier, "silver");
  assert.equal(card.bonusBalance, 120);
});

test("loyalty transaction tracks earned, remaining, expiry, and usage data", () => {
  const userId = new mongoose.Types.ObjectId();
  const cardId = new mongoose.Types.ObjectId();
  const orderId = new mongoose.Types.ObjectId();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const transaction = new LoyaltyTransaction({
    user: userId,
    card: cardId,
    order: orderId,
    type: "bonus_earned",
    direction: "credit",
    status: "active",
    amount: 150,
    remainingAmount: 90,
    balanceAfter: 240,
    expiresAt,
  });

  const error = transaction.validateSync();

  assert.equal(error, undefined);
  assert.equal(transaction.amount, 150);
  assert.equal(transaction.remainingAmount, 90);
  assert.equal(transaction.expiresAt, expiresAt);
});
