import mongoose from "mongoose";

import { ERROR_CODES } from "../app/constants/errorCodes.js";
import { createAppError } from "../app/lib/httpError.js";
import Product from "../models/Product.js";
import ProductQuestion, {
  PRODUCT_QUESTION_SOURCES,
  PRODUCT_QUESTION_STATUSES,
} from "../models/ProductQuestion.js";
import { sendProductQuestionReplyEmail } from "./emailService.js";
import { buildStorefrontProductUrl } from "./storefrontUrlService.js";

export const PRODUCT_QUESTION_MESSAGE_MAX_LENGTH = 3000;
export const PRODUCT_QUESTION_REPLY_MAX_LENGTH = 5000;

const STATUS_SET = new Set(PRODUCT_QUESTION_STATUSES);
const SOURCE_SET = new Set(PRODUCT_QUESTION_SOURCES);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const pickStr = (value) => String(value ?? "").trim();

const normalizeSpaces = (value) => value.replace(/[ \t\f\v\u00a0]+/g, " ");

const stripHtmlTags = (value) => value.replace(/<[^>]*>/g, "");

export const sanitizeQuestionText = (value, { maxLength = 1000, preserveNewlines = false } = {}) => {
  const stripped = stripHtmlTags(String(value ?? "").replace(/\r\n?/g, "\n"))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ");

  const normalized = preserveNewlines
    ? normalizeSpaces(stripped)
        .replace(/[ \t]*\n[ \t]*/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    : normalizeSpaces(stripped).replace(/\s+/g, " ").trim();

  return normalized.slice(0, maxLength);
};

export const normalizeCustomerEmail = (value) => pickStr(value).toLowerCase();

export const normalizeCustomerPhone = (value) =>
  pickStr(value)
    .replace(/[^\d+\-()\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);

export const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ""));

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const buildProductQuestionPageUrl = (product) => buildStorefrontProductUrl(product);

const asLean = async (query) => {
  if (query && typeof query.lean === "function") return query.lean();
  return query;
};

const withSelect = (query, fields) => {
  if (query && typeof query.select === "function") return query.select(fields);
  return query;
};

const withPopulate = (query, path, select) => {
  if (query && typeof query.populate === "function") return query.populate(path, select);
  return query;
};

const throwHttpError = (statusCode, message, code = ERROR_CODES.REQUEST_ERROR) => {
  throw createAppError({ statusCode, code, message });
};

const parseBoolean = (value, fallback = true) => {
  if (typeof value === "boolean") return value;
  const normalized = pickStr(value).toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const normalizeQuestionSource = (value) => {
  const normalized = sanitizeQuestionText(value, { maxLength: 40 })
    .toLowerCase()
    .replace(/-/g, "_");

  return SOURCE_SET.has(normalized) ? normalized : "product_page";
};

export const pickProductQuestionReplyMessage = (payload = {}) =>
  pickStr(payload.message ?? payload.answer ?? payload.answerText ?? payload.replyText);

export const buildProductQuestionSnapshot = (product) => ({
  name: {
    ua: sanitizeQuestionText(product?.name?.ua, { maxLength: 200 }),
    en: sanitizeQuestionText(product?.name?.en, { maxLength: 200 }),
  },
  sku: sanitizeQuestionText(product?.sku, { maxLength: 120 }),
  slug: sanitizeQuestionText(product?.slug, { maxLength: 240 }),
  pageUrl: buildProductQuestionPageUrl(product),
});

const isLegacyOrMissingProductQuestionUrl = (value) => {
  const url = pickStr(value);
  if (!url) return true;
  if (/\/products\//i.test(url)) return true;
  return !/\/catalog\//i.test(url);
};

export const refreshProductQuestionSnapshotUrl = async (
  question,
  { productModel = Product } = {}
) => {
  if (!question || !isLegacyOrMissingProductQuestionUrl(question?.productSnapshot?.pageUrl)) {
    return question;
  }
  if (!isValidObjectId(question.productId)) return question;

  const productQuery = productModel.findById(question.productId);
  const product = await asLean(withSelect(productQuery, "_id name sku slug category subCategory"));
  if (!product) return question;

  const snapshot = buildProductQuestionSnapshot(product);
  if (!snapshot.pageUrl) return question;

  return {
    ...question,
    productSnapshot: {
      ...(question.productSnapshot || {}),
      ...snapshot,
    },
  };
};

export const normalizeCreateProductQuestionPayload = (payload = {}) => {
  const customer = payload.customer || {};

  return {
    productId: pickStr(payload.productId),
    customer: {
      name: sanitizeQuestionText(customer.name ?? payload.customerName ?? payload.name, {
        maxLength: 120,
      }),
      email: normalizeCustomerEmail(customer.email ?? payload.customerEmail ?? payload.email),
      phone: normalizeCustomerPhone(customer.phone ?? payload.customerPhone ?? payload.phone),
    },
    message: sanitizeQuestionText(payload.message ?? payload.question, {
      maxLength: PRODUCT_QUESTION_MESSAGE_MAX_LENGTH,
      preserveNewlines: true,
    }),
    source: normalizeQuestionSource(payload.source),
  };
};

export const buildProductQuestionListFilter = ({ status = "", search = "" } = {}) => {
  const filter = {};
  const safeStatus = pickStr(status);
  if (safeStatus) {
    if (!STATUS_SET.has(safeStatus)) {
      throwHttpError(400, "Invalid product question status", ERROR_CODES.VALIDATION_ERROR);
    }
    filter.status = safeStatus;
  }

  const safeSearch = pickStr(search);
  if (safeSearch) {
    const regex = new RegExp(escapeRegex(safeSearch), "i");
    filter.$or = [
      { "customer.name": regex },
      { "customer.email": regex },
      { "productSnapshot.sku": regex },
    ];
  }

  return filter;
};

export const createProductQuestion = async (
  payload,
  { currentUser = null, productModel = Product, questionModel = ProductQuestion } = {}
) => {
  const normalized = normalizeCreateProductQuestionPayload(payload);

  if (!isValidObjectId(normalized.productId)) {
    throwHttpError(400, "productId is invalid", ERROR_CODES.VALIDATION_ERROR);
  }
  if (!normalized.customer.name) {
    throwHttpError(400, "customer.name is required", ERROR_CODES.VALIDATION_ERROR);
  }
  if (!normalized.customer.email && !normalized.customer.phone) {
    throwHttpError(400, "customer.email or customer.phone is required", ERROR_CODES.VALIDATION_ERROR);
  }
  if (normalized.customer.email && !EMAIL_RE.test(normalized.customer.email)) {
    throwHttpError(400, "customer.email is invalid", ERROR_CODES.VALIDATION_ERROR);
  }
  if (!normalized.message) {
    throwHttpError(400, "message is required", ERROR_CODES.VALIDATION_ERROR);
  }

  const productQuery = productModel.findById(normalized.productId);
  const product = await asLean(withSelect(productQuery, "_id name sku slug category subCategory"));
  if (!product) {
    throwHttpError(404, "Product not found", ERROR_CODES.NOT_FOUND);
  }

  const userId = currentUser?._id || currentUser?.id || null;

  return questionModel.create({
    productId: product._id,
    productSnapshot: buildProductQuestionSnapshot(product),
    userId,
    customer: normalized.customer,
    message: normalized.message,
    source: normalized.source,
    status: "new",
    isRead: false,
  });
};

export const listProductQuestions = async (
  query = {},
  { questionModel = ProductQuestion } = {}
) => {
  const page = parsePositiveInt(query.page, 1);
  const limit = Math.min(100, Math.max(1, parsePositiveInt(query.limit, 20)));
  const skip = (page - 1) * limit;
  const search = query.search ?? query.q ?? "";
  const filter = buildProductQuestionListFilter({ status: query.status, search });

  const [items, total] = await Promise.all([
    questionModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    questionModel.countDocuments(filter),
  ]);

  return {
    items,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    limit,
  };
};

export const getProductQuestionById = async (
  questionId,
  { questionModel = ProductQuestion } = {}
) => {
  if (!isValidObjectId(questionId)) {
    throwHttpError(400, "Product question id is invalid", ERROR_CODES.VALIDATION_ERROR);
  }

  const query = questionModel.findById(questionId);
  const populated = withPopulate(
    withPopulate(query, "userId", "name email"),
    "adminReply.repliedBy",
    "name email"
  );
  const question = await asLean(populated);

  if (!question) {
    throwHttpError(404, "Product question not found", ERROR_CODES.NOT_FOUND);
  }

  return question;
};

export const replyToProductQuestion = async (
  { questionId, message, answer, answerText, replyText, adminUser, status = "answered" } = {},
  {
    questionModel = ProductQuestion,
    productModel = Product,
    sendReplyEmail = sendProductQuestionReplyEmail,
  } = {}
) => {
  if (!isValidObjectId(questionId)) {
    throwHttpError(400, "Product question id is invalid", ERROR_CODES.VALIDATION_ERROR);
  }

  const replyMessage = sanitizeQuestionText(message, {
    maxLength: PRODUCT_QUESTION_REPLY_MAX_LENGTH,
    preserveNewlines: true,
  }) || sanitizeQuestionText(pickProductQuestionReplyMessage({ answer, answerText, replyText }), {
    maxLength: PRODUCT_QUESTION_REPLY_MAX_LENGTH,
    preserveNewlines: true,
  });
  if (!replyMessage) {
    throwHttpError(400, "reply message is required", ERROR_CODES.VALIDATION_ERROR);
  }

  const nextStatus = pickStr(status) || "answered";
  if (!STATUS_SET.has(nextStatus)) {
    throwHttpError(400, "Invalid product question status", ERROR_CODES.VALIDATION_ERROR);
  }

  const repliedAt = new Date();
  const repliedBy = adminUser?._id || adminUser?.id || null;

  let updateQuery = questionModel.findByIdAndUpdate(
    questionId,
    {
      $set: {
        status: nextStatus,
        "adminReply.message": replyMessage,
        "adminReply.repliedAt": repliedAt,
        "adminReply.repliedBy": repliedBy,
        "adminReply.emailSent": false,
        isRead: true,
      },
    },
    { new: true }
  );
  updateQuery = withPopulate(updateQuery, "adminReply.repliedBy", "name email");
  let updated = await asLean(updateQuery);

  if (!updated) {
    throwHttpError(404, "Product question not found", ERROR_CODES.NOT_FOUND);
  }

  let emailResult = { sent: false, skipped: true, reason: "NO_CUSTOMER_EMAIL" };
  try {
    updated = await refreshProductQuestionSnapshotUrl(updated, { productModel });
  } catch {
    // Keep the reply flow working even if a legacy snapshot cannot be refreshed.
  }

  try {
    emailResult = await sendReplyEmail({ question: updated, replyMessage });
  } catch (error) {
    emailResult = {
      sent: false,
      skipped: false,
      reason: "EMAIL_SEND_FAILED",
      error: error?.message || "Email send failed",
    };
  }

  if (emailResult?.sent) {
    let emailUpdateQuery = questionModel.findByIdAndUpdate(
      questionId,
      { $set: { "adminReply.emailSent": true } },
      { new: true }
    );
    emailUpdateQuery = withPopulate(emailUpdateQuery, "adminReply.repliedBy", "name email");
    updated = (await asLean(emailUpdateQuery)) || updated;
  }

  return { question: updated, email: emailResult };
};

export const updateProductQuestionStatus = async (
  { questionId, status } = {},
  { questionModel = ProductQuestion } = {}
) => {
  if (!isValidObjectId(questionId)) {
    throwHttpError(400, "Product question id is invalid", ERROR_CODES.VALIDATION_ERROR);
  }
  const safeStatus = pickStr(status);
  if (!STATUS_SET.has(safeStatus)) {
    throwHttpError(400, "Invalid product question status", ERROR_CODES.VALIDATION_ERROR);
  }

  const question = await asLean(
    questionModel.findByIdAndUpdate(questionId, { $set: { status: safeStatus } }, { new: true })
  );
  if (!question) {
    throwHttpError(404, "Product question not found", ERROR_CODES.NOT_FOUND);
  }
  return question;
};

export const updateProductQuestionReadState = async (
  { questionId, isRead = true } = {},
  { questionModel = ProductQuestion } = {}
) => {
  if (!isValidObjectId(questionId)) {
    throwHttpError(400, "Product question id is invalid", ERROR_CODES.VALIDATION_ERROR);
  }

  const question = await asLean(
    questionModel.findByIdAndUpdate(
      questionId,
      { $set: { isRead: parseBoolean(isRead, true) } },
      { new: true }
    )
  );
  if (!question) {
    throwHttpError(404, "Product question not found", ERROR_CODES.NOT_FOUND);
  }
  return question;
};
