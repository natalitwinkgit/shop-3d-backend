import bcrypt from "bcryptjs";
import Order from "../models/Order.js";
import User, {
  USER_ROLES,
  USER_STATUSES,
  isValidPhone,
  normalizePhone,
} from "../models/userModel.js";
import {
  ensureLoyaltyCard,
  getUserOrderSummary as getLoyaltyOrderSummary,
  listActiveLoyaltyRewards,
  markLoyaltyRewardUsedByOrder,
  restoreLoyaltyRewardFromOrder,
} from "./loyaltyService.js";

const ONLINE_WINDOW_MS = 30 * 1000;
const AWAY_WINDOW_MS = 5 * 60 * 1000;

const LOYALTY_TIERS = [
  { tier: "platinum", minTotalSpent: 100000, discountPct: 7 },
  { tier: "gold", minTotalSpent: 50000, discountPct: 5 },
  { tier: "silver", minTotalSpent: 20000, discountPct: 3 },
  { tier: "none", minTotalSpent: 0, discountPct: 0 },
];

const pickStr = (value) => String(value || "").trim();

const activeOrderMatch = () => ({
  $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
});

const toBool = (value) => String(value) === "true" || String(value) === "1" || value === true;

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const normalizeUserPhone = (value) => normalizePhone(value);

export const normalizeUserRole = (value, fallback = "user") => {
  const normalized = pickStr(value).toLowerCase();
  if (!normalized) return fallback;
  return USER_ROLES.includes(normalized) ? normalized : "";
};

export const normalizeUserStatus = (value, fallback = "active") => {
  const normalized = pickStr(value).toLowerCase();
  if (!normalized) return fallback;
  return USER_STATUSES.includes(normalized) ? normalized : "";
};

export const splitUserName = (name) => {
  const fullName = pickStr(name);
  if (!fullName) return { firstName: "", lastName: "" };

  const parts = fullName.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
};

const getRewardStatus = (reward, now = new Date()) => {
  const currentStatus = pickStr(reward?.status) || "active";
  const expiresAt = reward?.expiresAt ? new Date(reward.expiresAt) : null;

  if (currentStatus === "active" && expiresAt && expiresAt.getTime() < now.getTime()) {
    return "expired";
  }

  return currentStatus;
};

const normalizeRewards = (rewards = [], now = new Date()) =>
  (Array.isArray(rewards) ? rewards : []).map((reward) => ({
    rewardId: pickStr(reward?.rewardId),
    type: pickStr(reward?.type) || "next_order_discount",
    title: pickStr(reward?.title),
    description: pickStr(reward?.description),
    discountPct: toNumber(reward?.discountPct, 0),
    amountOff: toNumber(reward?.amountOff, 0),
    minOrderTotal: toNumber(reward?.minOrderTotal, 0),
    status: getRewardStatus(reward, now),
    issuedAt: reward?.issuedAt || null,
    expiresAt: reward?.expiresAt || null,
    usedAt: reward?.usedAt || null,
    usedOrderId: reward?.usedOrderId ? String(reward.usedOrderId) : null,
    note: pickStr(reward?.note),
  }));

const persistRewardStatusesIfNeeded = async (userDoc) => {
  const normalizedRewards = normalizeRewards(userDoc?.rewards || []);
  const hasChanges = normalizedRewards.some(
    (reward, index) => reward.status !== pickStr(userDoc?.rewards?.[index]?.status)
  );

  if (hasChanges && userDoc) {
    userDoc.rewards = normalizedRewards;
    await userDoc.save();
  }

  return normalizedRewards;
};

export const getPresenceStatus = (userDoc, now = Date.now()) => {
  if (userDoc?.isAiAssistant) return "online";
  if (!userDoc?.isOnline) return "offline";

  const lastActivityAt = new Date(
    userDoc?.lastActivityAt || userDoc?.lastHeartbeatAt || userDoc?.lastSeen || 0
  ).getTime();

  if (!lastActivityAt) return pickStr(userDoc?.presence) || "offline";

  const delta = Math.max(0, now - lastActivityAt);
  if (delta <= ONLINE_WINDOW_MS) return "online";
  if (delta <= AWAY_WINDOW_MS) return "away";
  return "offline";
};

const buildLoyaltyResponse = (loyalty = {}, fallbackUserId = "") => ({
  cardNumber:
    pickStr(loyalty?.cardNumber) ||
    (fallbackUserId ? `DC-${String(fallbackUserId).slice(-8).toUpperCase()}` : ""),
  tier: pickStr(loyalty?.tier) || "none",
  baseDiscountPct: toNumber(loyalty?.baseDiscountPct, 0),
  bonusBalance: toNumber(loyalty?.bonusBalance, 0),
  totalEarned: toNumber(loyalty?.totalEarned, 0),
  totalRedeemed: toNumber(loyalty?.totalRedeemed, 0),
  totalExpired: toNumber(loyalty?.totalExpired, 0),
  totalSpent: toNumber(loyalty?.totalSpent, 0),
  completedOrders: toNumber(loyalty?.completedOrders, 0),
  lastOrderAt: loyalty?.lastOrderAt || null,
  notes: pickStr(loyalty?.notes),
  manualOverride: !!loyalty?.manualOverride,
});

const buildAvatarResponse = (userDoc) => {
  const avatar = pickStr(userDoc?.avatar);
  return {
    avatar,
    avatarUrl: avatar,
    photo: avatar,
    photoUrl: avatar,
    image: avatar,
    imageUrl: avatar,
    avatarUpdatedAt: userDoc?.avatarUpdatedAt || null,
  };
};

const buildAddressesResponse = (addresses = []) =>
  (Array.isArray(addresses) ? addresses : []).map((address, index) => ({
    id: pickStr(address?.id) || `address_${index + 1}`,
    label: pickStr(address?.label),
    city: pickStr(address?.city),
    addressLine: pickStr(address?.addressLine),
    comment: pickStr(address?.comment),
    isPrimary: !!address?.isPrimary,
  }));

const buildAdminUserResponse = (userDoc, { orderSummary = null, rewards = null } = {}) => {
  const { firstName, lastName } = splitUserName(userDoc?.name);
  const normalizedRewards = rewards || normalizeRewards(userDoc?.rewards || []);
  const activeRewards = normalizedRewards.filter((reward) => reward.status === "active");
  const presence = getPresenceStatus(userDoc);

  return {
    id: String(userDoc?._id || userDoc?.id || ""),
    _id: String(userDoc?._id || userDoc?.id || ""),
    firstName,
    lastName,
    name: pickStr(userDoc?.name),
    email: pickStr(userDoc?.email),
    phone: pickStr(userDoc?.phone),
    city: pickStr(userDoc?.city),
    ...buildAvatarResponse(userDoc),
    role: pickStr(userDoc?.role) || "user",
    status: pickStr(userDoc?.status) || "active",
    isAiAssistant: !!userDoc?.isAiAssistant,
    isOnline: presence !== "offline",
    presence,
    lastSeen: userDoc?.lastSeen || null,
    lastActivityAt: userDoc?.lastActivityAt || null,
    lastHeartbeatAt: userDoc?.lastHeartbeatAt || null,
    lastLoginAt: userDoc?.lastLoginAt || null,
    lastLogoutAt: userDoc?.lastLogoutAt || null,
    lastPage: pickStr(userDoc?.lastPage),
    likesCount: Array.isArray(userDoc?.likes) ? userDoc.likes.length : 0,
    addresses: buildAddressesResponse(userDoc?.addresses),
    loyalty: buildLoyaltyResponse(userDoc?.loyalty, userDoc?._id || userDoc?.id),
    rewards: normalizedRewards,
    rewardsSummary: {
      active: activeRewards.length,
      used: normalizedRewards.filter((reward) => reward.status === "used").length,
      expired: normalizedRewards.filter((reward) => reward.status === "expired").length,
    },
    orderSummary: orderSummary || {
      totalOrders: 0,
      completedOrders: 0,
      totalSpent: 0,
      lastOrderAt: null,
      activeRewardCount: activeRewards.length,
    },
    createdAt: userDoc?.createdAt || null,
    updatedAt: userDoc?.updatedAt || null,
  };
};

export const buildPublicUserResponse = (userDoc) => {
  const { firstName, lastName } = splitUserName(userDoc?.name);
  const presence = getPresenceStatus(userDoc);
  const rewards = normalizeRewards(userDoc?.rewards || []);

  return {
    id: String(userDoc?._id || userDoc?.id || ""),
    _id: String(userDoc?._id || userDoc?.id || ""),
    firstName,
    lastName,
    name: pickStr(userDoc?.name),
    email: pickStr(userDoc?.email),
    phone: pickStr(userDoc?.phone),
    city: pickStr(userDoc?.city),
    ...buildAvatarResponse(userDoc),
    role: pickStr(userDoc?.role) || "user",
    status: pickStr(userDoc?.status) || "active",
    isOnline: presence !== "offline",
    presence,
    lastSeen: userDoc?.lastSeen || null,
    addresses: buildAddressesResponse(userDoc?.addresses),
    loyalty: buildLoyaltyResponse(userDoc?.loyalty, userDoc?._id || userDoc?.id),
    rewards,
    rewardsSummary: {
      active: rewards.filter((reward) => reward.status === "active").length,
      used: rewards.filter((reward) => reward.status === "used").length,
      expired: rewards.filter((reward) => reward.status === "expired").length,
    },
    likes: userDoc?.likes || [],
  };
};

const roundMoney = (value) => Math.max(0, Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100);

const buildRewardDiscountValue = (reward, baseAmount) => {
  const amountDiscount = Math.max(0, toNumber(reward?.amountOff, 0));
  const percentDiscount = Math.max(0, toNumber(reward?.discountPct, 0));
  const pctValue = roundMoney((baseAmount * percentDiscount) / 100);

  return Math.min(baseAmount, Math.max(amountDiscount, pctValue));
};

export const selectEligibleReward = ({
  rewards = [],
  subtotal = 0,
  loyaltyDiscount = 0,
  rewardId = "",
}) => {
  const safeSubtotal = roundMoney(subtotal);
  const safeLoyaltyDiscount = roundMoney(loyaltyDiscount);
  const baseAmount = Math.max(0, safeSubtotal - safeLoyaltyDiscount);
  const normalizedRewards = normalizeRewards(rewards);

  const eligibleRewards = normalizedRewards
    .filter((reward) => reward.status === "active")
    .filter((reward) => baseAmount >= Math.max(0, toNumber(reward.minOrderTotal, 0)))
    .filter((reward) => buildRewardDiscountValue(reward, baseAmount) > 0)
    .map((reward) => ({
      ...reward,
      discountValue: buildRewardDiscountValue(reward, baseAmount),
    }))
    .sort((a, b) => b.discountValue - a.discountValue);

  if (pickStr(rewardId)) {
    return eligibleRewards.find((reward) => reward.rewardId === pickStr(rewardId)) || null;
  }

  return eligibleRewards[0] || null;
};

export const buildCheckoutDiscountSummary = async ({ userId, subtotal, rewardId = "" }) => {
  const userDoc = await User.findById(userId);
  if (!userDoc) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }

  const card = await ensureLoyaltyCard(userId, { userDoc });
  const cardRewards = await listActiveLoyaltyRewards(userId, { subtotal });
  const legacyRewards = await persistRewardStatusesIfNeeded(userDoc);
  const rewards = [...cardRewards, ...legacyRewards];
  const loyalty = buildLoyaltyResponse(card || userDoc.loyalty, userDoc._id);
  const safeSubtotal = roundMoney(subtotal);
  const loyaltyDiscount = roundMoney((safeSubtotal * Math.max(0, toNumber(loyalty.baseDiscountPct, 0))) / 100);
  const selectedReward = selectEligibleReward({
    rewards,
    subtotal: safeSubtotal,
    loyaltyDiscount,
    rewardId,
  });
  const rewardDiscount = selectedReward ? roundMoney(selectedReward.discountValue) : 0;
  const totalSavings = roundMoney(loyaltyDiscount + rewardDiscount);
  const cartTotal = roundMoney(Math.max(0, safeSubtotal - totalSavings));

  return {
    userDoc,
    loyalty,
    selectedReward,
    loyaltyDiscount,
    rewardDiscount,
    totalSavings,
    cartTotal,
  };
};

export const getUserOrderSummary = async (userId) => {
  return getLoyaltyOrderSummary(userId);
};

const getTierByTotalSpent = (totalSpent) =>
  LOYALTY_TIERS.find((tier) => totalSpent >= tier.minTotalSpent) || LOYALTY_TIERS.at(-1);

export const recalculateUserLoyalty = async (userId) => {
  const userDoc = await User.findById(userId);
  if (!userDoc) return null;

  await ensureLoyaltyCard(userDoc._id, { userDoc });
  return User.findById(userDoc._id);
};

export const touchUserPresence = async (
  userId,
  { page = "", active = true, visible = true, source = "heartbeat" } = {}
) => {
  const now = new Date();
  const nextPresence = active && visible ? "online" : "away";

  const updated = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        isOnline: true,
        presence: nextPresence,
        lastSeen: now,
        lastActivityAt: active && visible ? now : now,
        lastHeartbeatAt: now,
        lastPage: pickStr(page),
      },
    },
    { new: true }
  ).select("-passwordHash -password");

  return updated;
};

export const markUserOffline = async (userId, { page = "", source = "logout" } = {}) => {
  const now = new Date();

  const updated = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        isOnline: false,
        presence: "offline",
        lastSeen: now,
        lastLogoutAt: now,
        ...(page ? { lastPage: pickStr(page) } : {}),
      },
    },
    { new: true }
  ).select("-passwordHash -password");

  return updated;
};

export const listAdminUsersData = async () => {
  const users = await User.find({})
    .select("-passwordHash -password")
    .sort({ createdAt: -1 })
    .lean();
  const userIds = users.map((userDoc) => userDoc._id);

  const summaryRows = userIds.length
    ? await Order.aggregate([
        { $match: { user: { $in: userIds }, ...activeOrderMatch() } },
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
      ])
    : [];

  const summaryMap = new Map(
    summaryRows.map((row) => [
      String(row._id),
      {
        totalOrders: toNumber(row.totalOrders, 0),
        completedOrders: toNumber(row.completedOrders, 0),
        totalSpent: toNumber(row.totalSpent, 0),
        lastOrderAt: row.lastOrderAt || null,
      },
    ])
  );

  return users.map((userDoc) =>
    buildAdminUserResponse(userDoc, {
      orderSummary: {
        ...(summaryMap.get(String(userDoc._id)) || {
          totalOrders: 0,
          completedOrders: 0,
          totalSpent: 0,
          lastOrderAt: null,
        }),
        activeRewardCount: normalizeRewards(userDoc.rewards || []).filter(
          (reward) => reward.status === "active"
        ).length,
      },
    })
  );
};

export const getAdminUserDetail = async (userId) => {
  const userDoc = await User.findById(userId).select("-passwordHash -password");
  if (!userDoc) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }

  const rewards = await persistRewardStatusesIfNeeded(userDoc);
  const summary = await getUserOrderSummary(userDoc._id);
  const recentOrders = await Order.find({ user: userDoc._id, ...activeOrderMatch() })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  return {
    user: buildAdminUserResponse(userDoc, {
      orderSummary: {
        ...summary,
        activeRewardCount: rewards.filter((reward) => reward.status === "active").length,
      },
      rewards,
    }),
    recentOrders,
  };
};

export const listAdminUserOrders = async (userId, { page = 1, limit = 20, status = "" } = {}) => {
  const filter = { user: userId, ...activeOrderMatch() };
  if (pickStr(status)) {
    filter.status = pickStr(status);
  }

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
    Order.countDocuments(filter),
  ]);

  return {
    items,
    total,
    page: safePage,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
};

export const updateUserLoyaltySettings = async (userId, payload = {}) => {
  const userDoc = await User.findById(userId);
  if (!userDoc) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }

  const existing = userDoc.loyalty?.toObject ? userDoc.loyalty.toObject() : userDoc.loyalty || {};

  userDoc.loyalty = {
    ...existing,
    cardNumber: pickStr(payload.cardNumber) || pickStr(existing.cardNumber),
    tier: pickStr(payload.tier) || pickStr(existing.tier) || "none",
    baseDiscountPct:
      payload.baseDiscountPct === undefined
        ? toNumber(existing.baseDiscountPct, 0)
        : Math.max(0, Math.min(100, toNumber(payload.baseDiscountPct, 0))),
    totalSpent:
      payload.totalSpent === undefined ? toNumber(existing.totalSpent, 0) : Math.max(0, toNumber(payload.totalSpent, 0)),
    completedOrders:
      payload.completedOrders === undefined
        ? toNumber(existing.completedOrders, 0)
        : Math.max(0, Math.floor(toNumber(payload.completedOrders, 0))),
    lastOrderAt: payload.lastOrderAt !== undefined ? (payload.lastOrderAt ? new Date(payload.lastOrderAt) : null) : existing.lastOrderAt || null,
    notes: payload.notes !== undefined ? pickStr(payload.notes) : pickStr(existing.notes),
    manualOverride:
      payload.manualOverride === undefined
        ? !!existing.manualOverride
        : toBool(payload.manualOverride),
  };

  await userDoc.save();
  await ensureLoyaltyCard(userDoc._id, { userDoc });
  return User.findById(userDoc._id);
};

export const createUserReward = async (userId, payload = {}) => {
  const userDoc = await User.findById(userId);
  if (!userDoc) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }

  userDoc.rewards.push({
    type: pickStr(payload.type) || "next_order_discount",
    title: pickStr(payload.title),
    description: pickStr(payload.description),
    discountPct: Math.max(0, Math.min(100, toNumber(payload.discountPct, 0))),
    amountOff: Math.max(0, toNumber(payload.amountOff, 0)),
    minOrderTotal: Math.max(0, toNumber(payload.minOrderTotal, 0)),
    status: pickStr(payload.status) || "active",
    issuedAt: payload.issuedAt ? new Date(payload.issuedAt) : new Date(),
    expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
    usedAt: payload.usedAt ? new Date(payload.usedAt) : null,
    usedOrderId: payload.usedOrderId || null,
    note: pickStr(payload.note),
  });

  await userDoc.save();
  return persistRewardStatusesIfNeeded(userDoc);
};

export const updateUserReward = async (userId, rewardId, payload = {}) => {
  const userDoc = await User.findById(userId);
  if (!userDoc) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }

  const rewards = Array.isArray(userDoc.rewards) ? userDoc.rewards : [];
  const reward = rewards.find((item) => pickStr(item.rewardId) === pickStr(rewardId));
  if (!reward) {
    const err = new Error("Reward not found");
    err.statusCode = 404;
    throw err;
  }

  if (payload.type !== undefined) reward.type = pickStr(payload.type) || reward.type;
  if (payload.title !== undefined) reward.title = pickStr(payload.title);
  if (payload.description !== undefined) reward.description = pickStr(payload.description);
  if (payload.discountPct !== undefined) {
    reward.discountPct = Math.max(0, Math.min(100, toNumber(payload.discountPct, 0)));
  }
  if (payload.amountOff !== undefined) reward.amountOff = Math.max(0, toNumber(payload.amountOff, 0));
  if (payload.minOrderTotal !== undefined) reward.minOrderTotal = Math.max(0, toNumber(payload.minOrderTotal, 0));
  if (payload.status !== undefined) reward.status = pickStr(payload.status) || reward.status;
  if (payload.expiresAt !== undefined) reward.expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : null;
  if (payload.usedAt !== undefined) reward.usedAt = payload.usedAt ? new Date(payload.usedAt) : null;
  if (payload.usedOrderId !== undefined) reward.usedOrderId = payload.usedOrderId || null;
  if (payload.note !== undefined) reward.note = pickStr(payload.note);

  await userDoc.save();
  return persistRewardStatusesIfNeeded(userDoc);
};

export const syncUserCommerceData = async (userId) => {
  const userDoc = await recalculateUserLoyalty(userId);
  if (!userDoc) return null;
  const rewards = await persistRewardStatusesIfNeeded(userDoc);
  const summary = await getUserOrderSummary(userDoc._id);

  return buildAdminUserResponse(userDoc, {
    orderSummary: {
      ...summary,
      activeRewardCount: rewards.filter((reward) => reward.status === "active").length,
    },
    rewards,
  });
};

export const markRewardUsedByOrder = async ({ userId, rewardId, orderId }) => {
  if (!pickStr(rewardId)) return null;

  const loyaltyReward = await markLoyaltyRewardUsedByOrder({ userId, rewardId, orderId });
  if (loyaltyReward) return loyaltyReward;

  const userDoc = await User.findById(userId);
  if (!userDoc) return null;

  const reward = (Array.isArray(userDoc.rewards) ? userDoc.rewards : []).find(
    (item) => pickStr(item.rewardId) === pickStr(rewardId)
  );

  if (!reward) return null;

  reward.status = "used";
  reward.usedAt = new Date();
  reward.usedOrderId = orderId || null;
  await userDoc.save();

  return reward;
};

export const restoreRewardFromOrder = async ({ userId, rewardId, orderId }) => {
  if (!pickStr(rewardId)) return null;

  const loyaltyReward = await restoreLoyaltyRewardFromOrder({ userId, rewardId, orderId });
  if (loyaltyReward) return loyaltyReward;

  const userDoc = await User.findById(userId);
  if (!userDoc) return null;

  const reward = (Array.isArray(userDoc.rewards) ? userDoc.rewards : []).find(
    (item) => pickStr(item.rewardId) === pickStr(rewardId)
  );

  if (!reward) return null;

  const usedOrderId = reward.usedOrderId ? String(reward.usedOrderId) : "";
  if (usedOrderId && pickStr(orderId) && usedOrderId !== pickStr(orderId)) {
    return reward;
  }

  reward.status = "active";
  reward.usedAt = null;
  reward.usedOrderId = null;
  await userDoc.save();

  return reward;
};

export const ensureSeedSuperadminUser = async () => {
  const email = pickStr(process.env.SUPERADMIN_EMAIL).toLowerCase();
  const phone = normalizePhone(process.env.SUPERADMIN_PHONE);
  const password = String(process.env.SUPERADMIN_PASSWORD || "");
  const name = pickStr(process.env.SUPERADMIN_NAME) || "Root Admin";

  if (!email || !phone || !password || !isValidPhone(phone)) {
    return null;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await User.updateOne(
    { email },
    {
      $setOnInsert: {
        name,
        email,
        phone,
        phoneNormalized: phone,
        passwordHash,
        role: "superadmin",
        status: "active",
        city: "",
      },
      $set: {
        phone,
        phoneNormalized: phone,
        updatedBy: null,
      },
    },
    { upsert: true }
  );

  return User.findOne({ email }).select("-passwordHash -password");
};

export const normalizePresenceInput = (body = {}) => ({
  page: pickStr(body.page || body.path || ""),
  active: body.active === undefined ? true : toBool(body.active),
  visible: body.visible === undefined ? true : toBool(body.visible),
  source: pickStr(body.source || "heartbeat"),
});
