import mongoose from "mongoose";

import Order from "../models/Order.js";
import User, { isValidPhone, normalizePhone } from "../models/userModel.js";
import { listUserAddresses } from "../services/accountProfileService.js";
import { listUserLikes } from "../services/likeService.js";
import { ensureLoyaltyCard } from "../services/loyaltyService.js";

const pickStr = (value) => String(value || "").trim();

const addPhoneVariant = (variants, value) => {
  const normalized = normalizePhone(value);
  if (!normalized) return;

  variants.add(normalized);

  const digits = normalized.replace(/\D/g, "");
  if (digits) {
    variants.add(digits);
    if (normalized.startsWith("+") || digits.length >= 11) {
      variants.add(`+${digits}`);
    }
  }
};

const phoneLookupVariants = (value) => {
  const digits = normalizePhone(value).replace(/\D/g, "");
  const variants = new Set();

  addPhoneVariant(variants, value);

  if (digits.length === 9) {
    addPhoneVariant(variants, `0${digits}`);
    addPhoneVariant(variants, `380${digits}`);
  }

  if (digits.length === 10 && digits.startsWith("0")) {
    addPhoneVariant(variants, digits.slice(1));
    addPhoneVariant(variants, `38${digits}`);
  }

  if (digits.length === 12 && digits.startsWith("380")) {
    addPhoneVariant(variants, digits.slice(3));
    addPhoneVariant(variants, `0${digits.slice(3)}`);
  }

  return [...variants].filter(Boolean);
};

const formatTelegramContactPhone = (value) => {
  const normalized = normalizePhone(value);
  const digits = normalized.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("380")) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith("0")) return `+38${digits}`;
  if (digits.length === 9) return `+380${digits}`;
  if (normalized.startsWith("+")) return normalized;
  return digits ? `+${digits}` : "";
};

const findActiveUser = async (websiteUserId) => {
  if (!mongoose.Types.ObjectId.isValid(websiteUserId)) return null;
  return User.findOne({ _id: websiteUserId, status: { $ne: "banned" } }).select(
    "-passwordHash -password"
  );
};

const userPreview = (userDoc) => ({
  websiteUserId: String(userDoc?._id || ""),
  userPreview: {
    name: pickStr(userDoc?.name),
    email: pickStr(userDoc?.email),
    phone: pickStr(userDoc?.phone),
  },
});

export const resolveTelegramUserByPhone = async (req, res, next) => {
  try {
    const variants = phoneLookupVariants(req.body?.phone || req.query?.phone);
    if (!variants.length) {
      return res.status(400).json({ code: "PHONE_REQUIRED", message: "Phone is required" });
    }

    const user = await User.findOne({
      status: { $ne: "banned" },
      $or: [{ phoneNormalized: { $in: variants } }, { phone: { $in: variants } }],
    }).select("-passwordHash -password");

    if (!user) {
      return res.status(404).json({
        code: "TELEGRAM_PHONE_NOT_FOUND",
        message: "No active account was found for this phone",
      });
    }

    return res.json(userPreview(user));
  } catch (error) {
    return next(error);
  }
};

export const getTelegramUserProfile = async (req, res, next) => {
  try {
    const user = await findActiveUser(req.params.websiteUserId);
    if (!user) return res.status(404).json({ code: "USER_NOT_FOUND", message: "User not found" });

    const card = await ensureLoyaltyCard(user._id, { userDoc: user });
    return res.json({
      profile: {
        id: String(user._id),
        name: pickStr(user.name),
        email: pickStr(user.email),
        phone: pickStr(user.phone),
        city: pickStr(user.city),
        discountPercent: Number(card?.baseDiscountPct ?? user.loyalty?.baseDiscountPct ?? 0),
        cardNumber: pickStr(card?.cardNumber || user.loyalty?.cardNumber),
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const updateTelegramUserPhoneFromContact = async (req, res, next) => {
  try {
    const user = await findActiveUser(req.params.websiteUserId);
    if (!user) return res.status(404).json({ code: "USER_NOT_FOUND", message: "User not found" });

    const phone = formatTelegramContactPhone(req.body?.phone || req.query?.phone);
    if (!phone || !isValidPhone(phone)) {
      return res.status(400).json({ code: "PHONE_REQUIRED", message: "Valid phone is required" });
    }

    const variants = phoneLookupVariants(phone);
    const existing = await User.findOne({
      _id: { $ne: user._id },
      status: { $ne: "banned" },
      $or: [{ phoneNormalized: { $in: variants } }, { phone: { $in: variants } }],
    }).select("_id");

    if (existing) {
      return res.status(409).json({
        code: "PHONE_ALREADY_USED",
        message: "This phone is already used by another account",
      });
    }

    user.phone = phone;
    user.phoneNormalized = normalizePhone(phone);
    await user.save();

    return res.json(userPreview(user));
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        code: "PHONE_ALREADY_USED",
        message: "This phone is already used by another account",
      });
    }
    return next(error);
  }
};

export const getTelegramUserOrders = async (req, res, next) => {
  try {
    const user = await findActiveUser(req.params.websiteUserId);
    if (!user) return res.status(404).json({ code: "USER_NOT_FOUND", message: "User not found" });

    const orders = await Order.find({
      user: user._id,
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    return res.json({
      orders: orders.map((order) => ({
        id: String(order._id),
        number: order.orderNumber || order.number || String(order._id).slice(-8).toUpperCase(),
        status: order.status,
        createdAt: order.createdAt,
        total: order.totals?.cartTotal || order.total || 0,
        items: (order.items || []).map((item) => ({
          name:
            pickStr(item.name?.ua) ||
            pickStr(item.name?.en) ||
            pickStr(item.name) ||
            pickStr(item.title),
        })),
      })),
    });
  } catch (error) {
    return next(error);
  }
};

export const getTelegramUserDiscount = async (req, res, next) => {
  try {
    const user = await findActiveUser(req.params.websiteUserId);
    if (!user) return res.status(404).json({ code: "USER_NOT_FOUND", message: "User not found" });

    const card = await ensureLoyaltyCard(user._id, { userDoc: user });
    return res.json({
      discount: {
        cardNumber: pickStr(card?.cardNumber || user.loyalty?.cardNumber),
        percent: Number(card?.baseDiscountPct ?? user.loyalty?.baseDiscountPct ?? 0),
        tier: pickStr(card?.tier || user.loyalty?.tier) || "none",
        bonusBalance: Number(card?.bonusBalance ?? user.loyalty?.bonusBalance ?? 0),
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const getTelegramUserFavorites = async (req, res, next) => {
  try {
    const user = await findActiveUser(req.params.websiteUserId);
    if (!user) return res.status(404).json({ code: "USER_NOT_FOUND", message: "User not found" });

    const favorites = await listUserLikes(user._id, { legacyLikes: user.likes || [] });
    return res.json({
      favorites: favorites.map((item) => ({
        id: pickStr(item.productId || item.id || item._id),
        name: pickStr(item.productName?.ua) || pickStr(item.productName?.en) || pickStr(item.name),
        image: pickStr(item.productImage || item.image),
      })),
    });
  } catch (error) {
    return next(error);
  }
};

export const getTelegramUserAddresses = async (req, res, next) => {
  try {
    const user = await findActiveUser(req.params.websiteUserId);
    if (!user) return res.status(404).json({ code: "USER_NOT_FOUND", message: "User not found" });

    const addresses = await listUserAddresses(user._id, { legacyAddresses: user.addresses || [] });
    return res.json({
      addresses: addresses.map((address) => ({
        id: pickStr(address.id || address._id),
        label: pickStr(address.label),
        city: pickStr(address.city),
        addressLine: pickStr(address.addressLine),
        comment: pickStr(address.comment),
        isPrimary: !!address.isPrimary,
      })),
    });
  } catch (error) {
    return next(error);
  }
};
