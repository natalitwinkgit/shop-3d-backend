import mongoose from "mongoose";

import LoyaltyCard from "../models/LoyaltyCard.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import Order from "../models/Order.js";
import User from "../models/userModel.js";

export const LOYALTY_TIER_RULES = [
  { tier: "platinum", minTotalSpent: 100000, discountPct: 7 },
  { tier: "gold", minTotalSpent: 50000, discountPct: 5 },
  { tier: "silver", minTotalSpent: 20000, discountPct: 3 },
  { tier: "none", minTotalSpent: 0, discountPct: 0 },
];

export const DEFAULT_BONUS_EARN_RATE_PCT = 3;
export const DEFAULT_BONUS_TTL_DAYS = 365;

const pickStr = (value) => String(value || "").trim();
const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const roundMoney = (value) =>
  Math.max(0, Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100);

const activeOrderMatch = () => ({
  $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
});

const getTierByTotalSpent = (totalSpent) =>
  LOYALTY_TIER_RULES.find((tier) => totalSpent >= tier.minTotalSpent) ||
  LOYALTY_TIER_RULES.at(-1);

const getUserId = (value) => value?._id || value?.id || value;

export const buildLoyaltyCardNumber = (userId) =>
  `DC-${String(userId || new mongoose.Types.ObjectId()).slice(-8).toUpperCase()}`;

export const getUserOrderSummary = async (userId) => {
  const [summary] = await Order.aggregate([
    { $match: { user: userId, ...activeOrderMatch() } },
    {
      $group: {
        _id: "$user",
        totalOrders: { $sum: 1 },
        completedOrders: {
          $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
        },
        totalSpent: {
          $sum: {
            $cond: [{ $eq: ["$status", "completed"] }, "$totals.cartTotal", 0],
          },
        },
        lastOrderAt: { $max: "$createdAt" },
      },
    },
  ]);

  return {
    totalOrders: toNumber(summary?.totalOrders, 0),
    completedOrders: toNumber(summary?.completedOrders, 0),
    totalSpent: roundMoney(summary?.totalSpent || 0),
    lastOrderAt: summary?.lastOrderAt || null,
  };
};

export const ensureLoyaltyCard = async (userId, { userDoc = null } = {}) => {
  const safeUserId = getUserId(userId);
  if (!safeUserId) return null;

  const user = userDoc || (await User.findById(safeUserId).select("_id loyalty").lean());
  if (!user) return null;

  const summary = await getUserOrderSummary(user._id || safeUserId);
  const existingCard = await LoyaltyCard.findOne({ user: user._id || safeUserId });
  const existingLoyalty = user.loyalty || {};
  const manualOverride = !!(existingCard?.manualOverride || existingLoyalty.manualOverride);
  const tierConfig = getTierByTotalSpent(summary.totalSpent);
  const nextTier = manualOverride ? pickStr(existingCard?.tier || existingLoyalty.tier) || "none" : tierConfig.tier;
  const nextDiscount = manualOverride
    ? toNumber(existingCard?.baseDiscountPct ?? existingLoyalty.baseDiscountPct, 0)
    : tierConfig.discountPct;

  const card = await LoyaltyCard.findOneAndUpdate(
    { user: user._id || safeUserId },
    {
      $setOnInsert: {
        user: user._id || safeUserId,
        cardNumber:
          pickStr(existingCard?.cardNumber) ||
          pickStr(existingLoyalty.cardNumber) ||
          buildLoyaltyCardNumber(user._id || safeUserId),
        earnRatePct: DEFAULT_BONUS_EARN_RATE_PCT,
        bonusTtlDays: DEFAULT_BONUS_TTL_DAYS,
        isActive: true,
      },
      $set: {
        tier: nextTier,
        baseDiscountPct: nextDiscount,
        totalSpent: summary.totalSpent,
        completedOrders: summary.completedOrders,
        lastOrderAt: summary.lastOrderAt,
        manualOverride,
        notes: pickStr(existingCard?.notes || existingLoyalty.notes),
      },
    },
    { new: true, upsert: true }
  );

  await syncUserLoyaltySnapshot(user._id || safeUserId, card);
  return card;
};

export const syncUserLoyaltySnapshot = async (userId, cardDoc) => {
  if (!userId || !cardDoc) return null;

  return User.updateOne(
    { _id: userId },
    {
      $set: {
        "loyalty.cardNumber": cardDoc.cardNumber,
        "loyalty.tier": cardDoc.tier,
        "loyalty.baseDiscountPct": cardDoc.baseDiscountPct,
        "loyalty.bonusBalance": cardDoc.bonusBalance,
        "loyalty.totalEarned": cardDoc.totalEarned,
        "loyalty.totalRedeemed": cardDoc.totalRedeemed,
        "loyalty.totalExpired": cardDoc.totalExpired,
        "loyalty.totalSpent": cardDoc.totalSpent,
        "loyalty.completedOrders": cardDoc.completedOrders,
        "loyalty.lastOrderAt": cardDoc.lastOrderAt,
        "loyalty.manualOverride": cardDoc.manualOverride,
        "loyalty.notes": cardDoc.notes || "",
      },
    }
  );
};

const buildRewardFromTransaction = (tx) => ({
  rewardId: String(tx._id || ""),
  type: "bonus_credit",
  title: pickStr(tx.title) || "Бонуси MebliHub",
  description: pickStr(tx.description),
  discountPct: 0,
  amountOff: roundMoney(tx.remainingAmount ?? tx.amount),
  minOrderTotal: 0,
  status: tx.status || "active",
  issuedAt: tx.issuedAt || tx.createdAt || null,
  expiresAt: tx.expiresAt || null,
  usedAt: tx.usedAt || null,
  usedOrderId: tx.usedOrderId ? String(tx.usedOrderId) : null,
  note: pickStr(tx.description),
});

export const expireLoyaltyBonuses = async (userId, { now = new Date() } = {}) => {
  const card = await ensureLoyaltyCard(userId);
  if (!card) return { expired: [], card: null };

  const expired = await LoyaltyTransaction.find({
    user: card.user,
    card: card._id,
    type: "bonus_earned",
    status: "active",
    $or: [{ remainingAmount: { $gt: 0 } }, { remainingAmount: { $exists: false }, amount: { $gt: 0 } }],
    expiresAt: { $ne: null, $lte: now },
  });

  if (!expired.length) return { expired: [], card };

  const totalExpired = roundMoney(
    expired.reduce((sum, tx) => sum + toNumber(tx.remainingAmount ?? tx.amount, 0), 0)
  );
  const nextBalance = roundMoney(Math.max(0, toNumber(card.bonusBalance, 0) - totalExpired));

  for (const tx of expired) {
    tx.status = "expired";
    tx.remainingAmount = 0;
    await tx.save();
  }

  card.bonusBalance = nextBalance;
  card.totalExpired = roundMoney(toNumber(card.totalExpired, 0) + totalExpired);
  await card.save();

  await LoyaltyTransaction.create({
    user: card.user,
    card: card._id,
    type: "bonus_expired",
    direction: "debit",
    status: "expired",
    amount: totalExpired,
    remainingAmount: 0,
    balanceAfter: card.bonusBalance,
    title: "Бонуси згоріли",
    description: "Строк дії бонусів завершився",
    issuedAt: now,
  });

  await syncUserLoyaltySnapshot(card.user, card);
  return { expired, card };
};

export const listActiveLoyaltyRewards = async (userId, { subtotal = 0 } = {}) => {
  const { card } = await expireLoyaltyBonuses(userId);
  if (!card) return [];

  const transactions = await LoyaltyTransaction.find({
    user: card.user,
    card: card._id,
    type: "bonus_earned",
    status: "active",
    $or: [{ remainingAmount: { $gt: 0 } }, { remainingAmount: { $exists: false }, amount: { $gt: 0 } }],
  })
    .sort({ expiresAt: 1, createdAt: 1 })
    .lean();

  return transactions
    .map((tx) => buildRewardFromTransaction(tx))
    .filter((reward) => reward.amountOff > 0);
};

export const markLoyaltyRewardUsedByOrder = async ({ userId, rewardId, orderId }) => {
  if (!pickStr(rewardId) || !mongoose.Types.ObjectId.isValid(String(rewardId))) return null;

  const card = await ensureLoyaltyCard(userId);
  if (!card) return null;

  const tx = await LoyaltyTransaction.findOne({
    _id: rewardId,
    user: card.user,
    card: card._id,
    type: "bonus_earned",
    status: "active",
  });
  if (!tx) return null;

  const order = orderId ? await Order.findById(orderId).select("totals.rewardDiscount").lean() : null;
  const remaining = roundMoney(tx.remainingAmount ?? tx.amount);
  const requestedSpend = roundMoney(order?.totals?.rewardDiscount || remaining);
  const amount = roundMoney(Math.min(remaining, requestedSpend));
  if (amount <= 0) return null;
  const nextBalance = roundMoney(Math.max(0, toNumber(card.bonusBalance, 0) - amount));

  tx.remainingAmount = roundMoney(remaining - amount);
  if (tx.remainingAmount <= 0) {
    tx.status = "used";
    tx.usedAt = new Date();
    tx.usedOrderId = orderId || null;
  }
  await tx.save();

  card.bonusBalance = nextBalance;
  card.totalRedeemed = roundMoney(toNumber(card.totalRedeemed, 0) + amount);
  await card.save();

  await LoyaltyTransaction.create({
    user: card.user,
    card: card._id,
    order: orderId || null,
    type: "bonus_redeemed",
    direction: "debit",
    status: "used",
    amount,
    remainingAmount: 0,
    balanceAfter: card.bonusBalance,
    title: "Бонуси використано",
    description: "Списання бонусів при оформленні замовлення",
    issuedAt: new Date(),
    usedAt: new Date(),
    usedOrderId: orderId || null,
    sourceTransactionId: tx._id,
  });

  await syncUserLoyaltySnapshot(card.user, card);
  return buildRewardFromTransaction(tx);
};

export const restoreLoyaltyRewardFromOrder = async ({ userId, rewardId, orderId }) => {
  if (!pickStr(rewardId) || !mongoose.Types.ObjectId.isValid(String(rewardId))) return null;

  const card = await ensureLoyaltyCard(userId);
  if (!card) return null;

  const tx = await LoyaltyTransaction.findOne({
    _id: rewardId,
    user: card.user,
    card: card._id,
    type: "bonus_earned",
  });
  if (!tx) return null;

  const debit = await LoyaltyTransaction.findOne({
    sourceTransactionId: tx._id,
    order: orderId || null,
    type: "bonus_redeemed",
    status: "used",
  });

  if (!debit) {
    return buildRewardFromTransaction(tx);
  }

  const amount = roundMoney(debit.amount);
  tx.status = "active";
  tx.remainingAmount = roundMoney(toNumber(tx.remainingAmount ?? tx.amount, 0) + amount);
  if (String(tx.usedOrderId || "") === pickStr(orderId)) {
    tx.usedAt = null;
    tx.usedOrderId = null;
  }
  await tx.save();

  debit.status = "cancelled";
  await debit.save();

  card.bonusBalance = roundMoney(toNumber(card.bonusBalance, 0) + amount);
  card.totalRedeemed = roundMoney(Math.max(0, toNumber(card.totalRedeemed, 0) - amount));
  await card.save();

  await LoyaltyTransaction.create({
    user: card.user,
    card: card._id,
    order: orderId || null,
    type: "bonus_cancelled",
    direction: "credit",
    status: "cancelled",
    amount,
    remainingAmount: 0,
    balanceAfter: card.bonusBalance,
    title: "Бонуси повернено",
    description: "Повернення бонусів після скасування замовлення",
    issuedAt: new Date(),
    sourceTransactionId: tx._id,
  });

  await syncUserLoyaltySnapshot(card.user, card);
  return buildRewardFromTransaction(tx);
};

export const awardLoyaltyBonusForCompletedOrder = async (order) => {
  if (!order || order.status !== "completed" || order.deletedAt) return null;

  const userId = getUserId(order.user);
  if (!userId) return null;

  const card = await ensureLoyaltyCard(userId);
  if (!card) return null;

  const existing = await LoyaltyTransaction.findOne({
    order: order._id,
    type: "bonus_earned",
  });
  if (existing) return existing;

  const paidTotal = roundMoney(order.totals?.cartTotal || 0);
  const earnRatePct = Math.max(0, toNumber(card.earnRatePct, DEFAULT_BONUS_EARN_RATE_PCT));
  const amount = roundMoney((paidTotal * earnRatePct) / 100);
  if (amount <= 0) return null;

  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt);
  expiresAt.setDate(expiresAt.getDate() + Math.max(1, toNumber(card.bonusTtlDays, DEFAULT_BONUS_TTL_DAYS)));

  card.bonusBalance = roundMoney(toNumber(card.bonusBalance, 0) + amount);
  card.totalEarned = roundMoney(toNumber(card.totalEarned, 0) + amount);
  await card.save();

  const tx = await LoyaltyTransaction.create({
    user: card.user,
    card: card._id,
    order: order._id,
    type: "bonus_earned",
    direction: "credit",
    status: "active",
    amount,
    remainingAmount: amount,
    balanceAfter: card.bonusBalance,
    title: "Бонуси за покупку",
    description: `Нараховано ${earnRatePct}% від завершеного замовлення`,
    issuedAt,
    expiresAt,
    metadata: {
      earnRatePct,
      orderTotal: paidTotal,
    },
  });

  await syncUserLoyaltySnapshot(card.user, card);
  return tx;
};

export const cancelLoyaltyBonusForOrder = async (order) => {
  if (!order?._id) return null;

  const earned = await LoyaltyTransaction.findOne({
    order: order._id,
    type: "bonus_earned",
    status: "active",
  });
  if (!earned) return null;

  const card = await LoyaltyCard.findById(earned.card);
  if (!card) return null;

  const amount = roundMoney(earned.remainingAmount ?? earned.amount);
  earned.status = "cancelled";
  earned.remainingAmount = 0;
  await earned.save();

  card.bonusBalance = roundMoney(Math.max(0, toNumber(card.bonusBalance, 0) - amount));
  await card.save();

  await LoyaltyTransaction.create({
    user: earned.user,
    card: earned.card,
    order: order._id,
    type: "bonus_cancelled",
    direction: "debit",
    status: "cancelled",
    amount,
    balanceAfter: card.bonusBalance,
    title: "Бонуси скасовано",
    description: "Нарахування скасовано через зміну статусу замовлення",
    issuedAt: new Date(),
    sourceTransactionId: earned._id,
  });

  await syncUserLoyaltySnapshot(card.user, card);
  return earned;
};

export const syncOrderLoyaltyEffects = async (order) => {
  if (!order) return null;

  if (order.status === "completed" && !order.deletedAt) {
    return awardLoyaltyBonusForCompletedOrder(order);
  }

  return cancelLoyaltyBonusForOrder(order);
};

export const getLoyaltyAccount = async (userId, { limit = 50 } = {}) => {
  const { card } = await expireLoyaltyBonuses(userId);
  if (!card) return null;

  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  const [transactions, rewards] = await Promise.all([
    LoyaltyTransaction.find({ user: card.user, card: card._id })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .populate("order", "_id status createdAt totals.cartTotal")
      .populate("usedOrderId", "_id status createdAt totals.cartTotal")
      .lean(),
    listActiveLoyaltyRewards(card.user),
  ]);

  return {
    card: {
      _id: String(card._id),
      user: String(card.user),
      cardNumber: card.cardNumber,
      tier: card.tier,
      baseDiscountPct: toNumber(card.baseDiscountPct, 0),
      bonusBalance: roundMoney(card.bonusBalance),
      totalEarned: roundMoney(card.totalEarned),
      totalRedeemed: roundMoney(card.totalRedeemed),
      totalExpired: roundMoney(card.totalExpired),
      totalSpent: roundMoney(card.totalSpent),
      completedOrders: toNumber(card.completedOrders, 0),
      lastOrderAt: card.lastOrderAt || null,
      earnRatePct: toNumber(card.earnRatePct, DEFAULT_BONUS_EARN_RATE_PCT),
      bonusTtlDays: toNumber(card.bonusTtlDays, DEFAULT_BONUS_TTL_DAYS),
    },
    rewards,
    rewardsSummary: {
      active: rewards.length,
      activeAmount: roundMoney(rewards.reduce((sum, reward) => sum + toNumber(reward.amountOff, 0), 0)),
    },
    transactions: transactions.map((tx) => ({
      _id: String(tx._id),
      type: tx.type,
      direction: tx.direction,
      status: tx.status,
      amount: roundMoney(tx.amount),
      balanceAfter: roundMoney(tx.balanceAfter),
      title: pickStr(tx.title),
      description: pickStr(tx.description),
      issuedAt: tx.issuedAt || tx.createdAt || null,
      expiresAt: tx.expiresAt || null,
      usedAt: tx.usedAt || null,
      order: tx.order || null,
      usedOrderId: tx.usedOrderId || null,
      createdAt: tx.createdAt || null,
    })),
  };
};
