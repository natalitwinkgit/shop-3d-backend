import mongoose from "mongoose";

import Like from "../models/Like.js";
import User from "../models/userModel.js";

const pickStr = (value) => String(value || "").trim();
const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeProductId = (payload = {}) => pickStr(payload.productId || payload.product || payload._id || payload.id);

const normalizeProductName = (value) => {
  if (value && typeof value === "object") {
    return {
      ua: pickStr(value.ua || value.uk || value.name_ua),
      en: pickStr(value.en || value.name_en),
    };
  }

  return { ua: pickStr(value), en: "" };
};

const formatLike = (doc = {}) => ({
  id: String(doc._id || doc.id || ""),
  _id: String(doc._id || doc.id || ""),
  productId: String(doc.product?._id || doc.product || doc.productId || ""),
  product: doc.product || doc.productId || null,
  productName: {
    ua: pickStr(doc.productName?.ua),
    en: pickStr(doc.productName?.en),
  },
  productCategory: pickStr(doc.productCategory),
  productImage: pickStr(doc.productImage),
  image: pickStr(doc.productImage),
  price: toNumber(doc.price, 0),
  discount: toNumber(doc.discount, 0),
  createdAt: doc.createdAt || null,
});

const migrateLegacyLikes = async (userId, legacyLikes = []) => {
  const source = Array.isArray(legacyLikes) ? legacyLikes : [];
  const docs = [];

  for (const item of source) {
    const productId = normalizeProductId(item);
    if (!mongoose.Types.ObjectId.isValid(productId)) continue;

    await Like.updateOne(
      { user: userId, product: productId },
      {
        $setOnInsert: {
          user: userId,
          product: productId,
          productName: normalizeProductName(item.productName),
          productCategory: pickStr(item.productCategory),
          productImage: pickStr(item.productImage),
          price: toNumber(item.price, 0),
          discount: toNumber(item.discount, 0),
        },
      },
      { upsert: true }
    );
  }

  if (source.length) {
    docs.push(...(await Like.find({ user: userId }).sort({ createdAt: -1 }).lean()));
  }

  return docs;
};

export const listUserLikes = async (userId, { legacyLikes = [] } = {}) => {
  if (!userId) return [];

  let docs = await Like.find({ user: userId }).sort({ createdAt: -1 }).lean();
  if (!docs.length && Array.isArray(legacyLikes) && legacyLikes.length) {
    docs = await migrateLegacyLikes(userId, legacyLikes);
    await User.updateOne({ _id: userId }, { $set: { likes: [] } });
  }

  return docs.map(formatLike);
};

export const countUserLikes = async (userId, { legacyLikes = [] } = {}) => {
  if (!userId) return 0;
  const count = await Like.countDocuments({ user: userId });
  return count || (Array.isArray(legacyLikes) ? legacyLikes.length : 0);
};

export const toggleUserLike = async (userId, payload = {}) => {
  const productId = normalizeProductId(payload);
  if (!userId || !mongoose.Types.ObjectId.isValid(productId)) {
    const error = new Error("productId is required");
    error.statusCode = 400;
    throw error;
  }

  const existing = await Like.findOne({ user: userId, product: productId });
  if (existing) {
    await Like.deleteOne({ _id: existing._id });
    await User.updateOne({ _id: userId }, { $pull: { likes: { productId } } });
    return {
      liked: false,
      likes: await listUserLikes(userId),
    };
  }

  await Like.create({
    user: userId,
    product: productId,
    productName: normalizeProductName(payload.productName || payload.name),
    productCategory: pickStr(payload.productCategory || payload.category),
    productImage: pickStr(payload.productImage || payload.image),
    price: toNumber(payload.price, 0),
    discount: toNumber(payload.discount, 0),
  });
  await User.updateOne({ _id: userId }, { $set: { likes: [] } });

  return {
    liked: true,
    likes: await listUserLikes(userId),
  };
};
