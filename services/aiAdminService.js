import bcrypt from "bcryptjs";
import crypto from "crypto";
import OpenAI from "openai";

import Inventory from "../models/Inventory.js";
import Location from "../models/Location.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import User from "../models/userModel.js";
import { getExternalConversationHistory, loadAdminIndex } from "./adminChatService.js";
import { createChatMessage } from "./chatMessageService.js";

let openaiClient = null;

const DEFAULT_OPENAI_MODEL = "gpt-5-mini";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
const MAX_TOOL_ROUNDS = 6;

const clampInt = (value, min, max, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const parseList = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const pickStr = (value) => String(value ?? "").trim();

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isObjectIdLike = (value) => /^[a-f0-9]{24}$/i.test(String(value || ""));

const normalizePhone = (value) => String(value || "").replace(/[^\d+]/g, "").trim();

const normalizeNumberFromText = (value) => {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
};

const PRODUCT_CATEGORY_ALIASES = {
  sofas: ["диван", "дивани", "sofa", "sofas", "couch", "couches"],
  beds: ["ліжко", "ліжка", "ліжкою", "bed", "beds"],
  chairs: ["стілець", "стільці", "крісло", "крісла", "chair", "chairs", "stool", "stools"],
  tables: ["стіл", "столи", "столик", "столики", "table", "tables", "desk", "desks"],
};

const GENERIC_PRODUCT_TERMS = [
  "товар",
  "товари",
  "меблі",
  "мебель",
  "product",
  "products",
  "furniture",
];

const safeParseJson = (value) => {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const isGenericProductQuery = (query) => {
  const normalized = pickStr(query).toLowerCase();
  if (!normalized) return true;

  const compact = normalized.replace(/\s+/g, " ").trim();
  return GENERIC_PRODUCT_TERMS.includes(compact);
};

const detectProductCategory = (query, explicitCategory = "") => {
  const explicit = pickStr(explicitCategory).toLowerCase();
  if (explicit) {
    if (PRODUCT_CATEGORY_ALIASES[explicit]) return explicit;

    for (const [categoryKey, aliases] of Object.entries(PRODUCT_CATEGORY_ALIASES)) {
      if (categoryKey === explicit || aliases.some((alias) => explicit.includes(alias))) {
        return categoryKey;
      }
    }
  }

  const normalized = pickStr(query).toLowerCase();
  for (const [categoryKey, aliases] of Object.entries(PRODUCT_CATEGORY_ALIASES)) {
    if (aliases.some((alias) => normalized.includes(alias))) {
      return categoryKey;
    }
  }

  return "";
};

const parseBudgetFromQuery = (query) => {
  const text = pickStr(query).toLowerCase();
  if (!text) return {};

  const result = {};
  const rangeMatch = text.match(/від\s*([\d\s]+)\s*(?:грн|гривень|uah)?\s*до\s*([\d\s]+)\s*(?:грн|гривень|uah)?/i);
  if (rangeMatch) {
    const minValue = normalizeNumberFromText(rangeMatch[1]);
    const maxValue = normalizeNumberFromText(rangeMatch[2]);
    if (minValue !== null) result.minPrice = minValue;
    if (maxValue !== null) result.maxPrice = maxValue;
    return result;
  }

  const maxMatch = text.match(/до\s*([\d\s]+)\s*(?:грн|гривень|uah)?/i);
  if (maxMatch) {
    const maxValue = normalizeNumberFromText(maxMatch[1]);
    if (maxValue !== null) result.maxPrice = maxValue;
  }

  const minMatch = text.match(/від\s*([\d\s]+)\s*(?:грн|гривень|uah)?/i);
  if (minMatch) {
    const minValue = normalizeNumberFromText(minMatch[1]);
    if (minValue !== null) result.minPrice = minValue;
  }

  return result;
};

const buildEffectivePriceExpr = () => ({
  $multiply: [
    { $ifNull: ["$price", 0] },
    {
      $subtract: [1, { $divide: [{ $ifNull: ["$discount", 0] }, 100] }],
    },
  ],
});

const trimTrailingSlash = (value) => String(value || "").replace(/\/+$/, "");

const getStorefrontBaseUrl = () => {
  const explicitBaseUrl = trimTrailingSlash(process.env.PUBLIC_STORE_URL);
  if (explicitBaseUrl) return explicitBaseUrl;

  const clientUrl = parseList(process.env.CLIENT_URL)[0];
  return trimTrailingSlash(clientUrl);
};

const buildStorefrontProductUrl = (slug) => {
  const safeSlug = pickStr(slug);
  if (!safeSlug) return "";

  const baseUrl = getStorefrontBaseUrl();
  if (!baseUrl) return `/products/${safeSlug}`;

  return `${baseUrl}/products/${encodeURIComponent(safeSlug)}`;
};

const formatMoneyUa = (value) => {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("uk-UA", {
    maximumFractionDigits: 0,
  }).format(amount);
};

const getProductDisplayName = (productDoc) =>
  pickStr(productDoc?.name?.ua) ||
  pickStr(productDoc?.name?.en) ||
  pickStr(productDoc?.slug) ||
  "Товар";

const buildProductCards = (items) =>
  (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .slice(0, 6)
    .map((item) => ({
      id: String(item.id || ""),
      slug: pickStr(item.slug),
      title: getProductDisplayName(item),
      category: pickStr(item.category),
      subCategory: pickStr(item.subCategory),
      price: Number(item.price || 0),
      finalPrice: Number(item.finalPrice || item.price || 0),
      currency: "UAH",
      image: pickStr(item.primaryImage || item.images?.[0] || ""),
      storefrontUrl: pickStr(item.storefrontUrl) || buildStorefrontProductUrl(item.slug),
      apiUrl: pickStr(item.apiUrl) || `/api/products/by-slug/${encodeURIComponent(pickStr(item.slug))}`,
      inStock: !!item.inStock,
      stockQty: Number(item.stockQty || 0),
    }));

const getResolvedProductSearch = ({ toolState, prefetchedProductSearch }) =>
  toolState?.latestProductSearch?.count ? toolState.latestProductSearch : prefetchedProductSearch || null;

const buildAiMessageMeta = ({
  provider,
  model,
  currentAdmin,
  responseId,
  productSearch,
  fallbackReason = "",
}) => {
  const productCards = buildProductCards(productSearch?.items || []);

  return {
    provider,
    model,
    requestedByAdminId: currentAdmin?.id || "",
    requestedByAdminName: currentAdmin?.name || currentAdmin?.email || "",
    runResponseId: responseId || "",
    fallbackReason: pickStr(fallbackReason),
    productCards,
    productSearch: productSearch
      ? {
          query: pickStr(productSearch.query),
          category: pickStr(productSearch.category),
          minPrice:
            productSearch.minPrice == null ? null : Number(productSearch.minPrice),
          maxPrice:
            productSearch.maxPrice == null ? null : Number(productSearch.maxPrice),
          count: Number(productSearch.count || 0),
        }
      : null,
  };
};

const looksLikeProductSearchMessage = (query) => {
  const normalized = pickStr(query).toLowerCase();
  if (!normalized) return false;

  const hasBudget =
    parseBudgetFromQuery(normalized).minPrice != null ||
    parseBudgetFromQuery(normalized).maxPrice != null;

  if (hasBudget) return true;
  if (GENERIC_PRODUCT_TERMS.some((term) => normalized.includes(term))) return true;

  return Object.values(PRODUCT_CATEGORY_ALIASES).some((aliases) =>
    aliases.some((alias) => normalized.includes(alias))
  );
};

const buildVerifiedCatalogReply = ({ prefetchedProductSearch }) => {
  const items = Array.isArray(prefetchedProductSearch?.items)
    ? prefetchedProductSearch.items.filter(Boolean)
    : [];

  if (!items.length) return "";

  const topItems = items.slice(0, 3);
  const intro =
    prefetchedProductSearch?.count > topItems.length
      ? "Знайшов кілька варіантів у каталозі за вашим запитом:"
      : "Знайшов у каталозі такі варіанти за вашим запитом:";

  const lines = topItems.map((item, index) => {
    const price = Number(item.finalPrice || item.price || 0);
    const url = pickStr(item.storefrontUrl) || buildStorefrontProductUrl(item.slug);
    return [
      `${index + 1}. ${getProductDisplayName(item)} — ${formatMoneyUa(price)} грн`,
      url ? `Переглянути: ${url}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    intro,
    ...lines,
    "Якщо хочете, підберу ще варіанти за розміром, кольором, формою або іншим бюджетом.",
  ].join("\n");
};

const looksLikeNoResultsDraft = (draft) => {
  const normalized = pickStr(draft).toLowerCase();
  if (!normalized) return true;

  return [
    /не\s+(?:знайшов|знайшла|знайшли)/i,
    /не\s+зміг\s+знайти/i,
    /не\s+вдалося\s+знайти/i,
    /нічого\s+не\s+знай/i,
    /результат(?:ів|ы|ов)?\s+не\s+знай/i,
    /не\s+знайдено/i,
    /no\s+results?/i,
  ].some((pattern) => pattern.test(normalized));
};

const applyVerifiedCatalogFallback = ({ draft, prefetchedProductSearch }) => {
  const normalizedDraft = pickStr(draft);
  const hasVerifiedItems = Array.isArray(prefetchedProductSearch?.items) && prefetchedProductSearch.items.length;

  if (!hasVerifiedItems) return normalizedDraft;
  if (!normalizedDraft || looksLikeNoResultsDraft(normalizedDraft)) {
    return buildVerifiedCatalogReply({ prefetchedProductSearch });
  }

  return normalizedDraft;
};

const toSerializableMessage = (messageDoc) => {
  const plain =
    typeof messageDoc?.toObject === "function" ? messageDoc.toObject() : { ...(messageDoc || {}) };

  return {
    ...plain,
    sender: String(plain.sender || ""),
    receiver: String(plain.receiver || ""),
    from: String(plain.sender || ""),
    to: String(plain.receiver || ""),
  };
};

const getAiProvider = () => {
  const explicitProvider = pickStr(process.env.AI_PROVIDER).toLowerCase();
  if (explicitProvider === "gemini" || explicitProvider === "openai") {
    return explicitProvider;
  }

  if (pickStr(process.env.GEMINI_API_KEY)) return "gemini";
  if (pickStr(process.env.OPENAI_API_KEY)) return "openai";

  return "gemini";
};

const getOpenAiClient = () => {
  const apiKey = pickStr(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    const err = new Error("OPENAI_API_KEY is not configured");
    err.statusCode = 503;
    throw err;
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }

  return openaiClient;
};

const getGeminiApiKey = () => {
  const apiKey = pickStr(process.env.GEMINI_API_KEY);
  if (!apiKey) {
    const err = new Error("GEMINI_API_KEY is not configured");
    err.statusCode = 503;
    throw err;
  }

  return apiKey;
};

const getGeminiApiUrl = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(getGeminiApiKey())}`;

export const getAiAdminModel = () => {
  const provider = getAiProvider();

  if (provider === "gemini") {
    return pickStr(process.env.GEMINI_MODEL) || DEFAULT_GEMINI_MODEL;
  }

  return pickStr(process.env.OPENAI_MODEL) || DEFAULT_OPENAI_MODEL;
};

export const isAiAdminEnabled = () => {
  const provider = getAiProvider();
  if (provider === "gemini") return Boolean(pickStr(process.env.GEMINI_API_KEY));
  return Boolean(pickStr(process.env.OPENAI_API_KEY));
};

const createProviderError = (message, statusCode = 500, raw = null) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (raw) err.raw = raw;
  return err;
};

const sanitizeGeminiSchema = (schema) => {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return schema;
  }

  const sanitized = {};

  if (schema.type) {
    sanitized.type = schema.type === "integer" ? "number" : schema.type;
  }

  if (typeof schema.description === "string" && schema.description.trim()) {
    sanitized.description = schema.description.trim();
  }

  if (Array.isArray(schema.enum) && schema.enum.length) {
    sanitized.enum = schema.enum;
  }

  if (Array.isArray(schema.required) && schema.required.length) {
    sanitized.required = schema.required;
  }

  if (schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)) {
    sanitized.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [key, sanitizeGeminiSchema(value)])
    );
  }

  if (schema.items) {
    sanitized.items = sanitizeGeminiSchema(schema.items);
  }

  return sanitized;
};

const buildGeminiToolDeclarations = (tools) =>
  tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: sanitizeGeminiSchema(
      tool.parameters || {
        type: "object",
        properties: {},
      }
    ),
  }));

const createGeminiTextContent = (role, text) => ({
  role,
  parts: [{ text: String(text || "") }],
});

const extractGeminiCandidate = (responseJson) => {
  const candidate = responseJson?.candidates?.[0];
  const content = candidate?.content || { role: "model", parts: [] };
  const parts = Array.isArray(content.parts) ? content.parts : [];

  return {
    candidate,
    content,
    functionCalls: parts
      .map((part) => part?.functionCall)
      .filter(Boolean)
      .map((call) => ({
        id: String(call.id || ""),
        name: String(call.name || ""),
        args: call.args && typeof call.args === "object" ? call.args : {},
      })),
    text: parts
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim(),
  };
};

const callGeminiGenerateContent = async ({
  model,
  systemInstruction,
  contents,
  tools,
  maxOutputTokens = 700,
}) => {
  const response = await fetch(getGeminiApiUrl(model), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: {
        role: "system",
        parts: [{ text: String(systemInstruction || "") }],
      },
      contents,
      tools: tools.length
        ? [
            {
              functionDeclarations: buildGeminiToolDeclarations(tools),
            },
          ]
        : undefined,
      toolConfig: tools.length
        ? {
            functionCallingConfig: {
              mode: "AUTO",
            },
          }
        : undefined,
      generationConfig: {
        maxOutputTokens: maxOutputTokens,
        temperature: 0.4,
      },
    }),
  });

  const responseJson = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      responseJson?.error?.message ||
      response.statusText ||
      "Gemini request failed";

    throw createProviderError(message, response.status, responseJson);
  }

  return responseJson;
};

export const ensureAiAdminUser = async () => {
  const preferredEmail = pickStr(process.env.AI_ADMIN_EMAIL);
  const preferredName = pickStr(process.env.AI_ADMIN_NAME) || "AI Support";
  const preferredPassword = pickStr(process.env.AI_ADMIN_PASSWORD);

  if (preferredEmail) {
    const existingByEmail = await User.findOne({ email: preferredEmail }).select("+password");
    if (existingByEmail) {
      if (existingByEmail.role !== "admin") existingByEmail.role = "admin";
      if (existingByEmail.status !== "active") existingByEmail.status = "active";
      if (!existingByEmail.isAiAssistant) existingByEmail.isAiAssistant = true;
      if (!existingByEmail.name) existingByEmail.name = preferredName;
      await existingByEmail.save();
      return existingByEmail;
    }
  }

  const existingAiUser = await User.findOne({ role: "admin", isAiAssistant: true }).select("+password");
  if (existingAiUser) return existingAiUser;

  const randomPassword = preferredPassword || crypto.randomBytes(24).toString("hex");
  const hashedPassword = await bcrypt.hash(randomPassword, 10);

  const aiUser = await User.create({
    name: preferredName,
    email: preferredEmail || "ai-support@shop3d.local",
    password: hashedPassword,
    role: "admin",
    status: "active",
    isAiAssistant: true,
    isOnline: false,
    lastSeen: new Date(),
  });

  return aiUser;
};

const findChatUser = async (externalUserId) => {
  const externalId = pickStr(externalUserId);
  if (!externalId) {
    const err = new Error("chatUserId is required");
    err.statusCode = 400;
    throw err;
  }

  if (externalId.startsWith("guest_")) {
    const guestMessages = await getExternalConversationHistory(externalId);
    const lastGuestMessage = [...guestMessages].reverse().find((item) => item.isGuest);

    return {
      id: externalId,
      kind: "guest",
      isGuest: true,
      name: pickStr(lastGuestMessage?.guestName) || "Guest",
      email: "",
      phone: "",
      status: "active",
    };
  }

  const userDoc = await User.findById(externalId).select("_id name email status role").lean();
  if (!userDoc) {
    const err = new Error("Chat user not found");
    err.statusCode = 404;
    throw err;
  }

  if (userDoc.role === "admin") {
    const err = new Error("AI admin only supports customer and guest chats");
    err.statusCode = 400;
    throw err;
  }

  return {
    id: String(userDoc._id),
    kind: "user",
    isGuest: false,
    name: userDoc.name || userDoc.email || "User",
    email: userDoc.email || "",
    phone: "",
    status: userDoc.status || "active",
  };
};

const formatConversationForModel = ({ history, adminMap, chatUser }) =>
  history.map((messageDoc) => {
    const senderId = String(messageDoc.sender || "");
    const receiverId = String(messageDoc.receiver || "");
    const senderAdmin = adminMap.get(senderId);
    const receiverAdmin = adminMap.get(receiverId);

    return {
      id: String(messageDoc._id || ""),
      at: messageDoc.createdAt,
      from: senderAdmin
        ? `admin:${senderAdmin.name || "Admin"}`
        : senderId === chatUser.id
          ? chatUser.isGuest
            ? `guest:${chatUser.name}`
            : `customer:${chatUser.name}`
          : senderId,
      to: receiverAdmin
        ? `admin:${receiverAdmin.name || "Admin"}`
        : receiverId === chatUser.id
          ? chatUser.isGuest
            ? `guest:${chatUser.name}`
            : `customer:${chatUser.name}`
          : receiverId,
      text: pickStr(messageDoc.text),
      isRead: !!messageDoc.isRead,
      source: messageDoc.source || "human",
    };
  });

const getLatestCustomerMessage = ({ history, chatUser }) =>
  [...history]
    .reverse()
    .find((messageDoc) => String(messageDoc.sender || "") === String(chatUser.id || ""));

const buildPrefetchedProductSearch = async ({ history, chatUser }) => {
  const latestCustomerMessage = getLatestCustomerMessage({ history, chatUser });
  const query = pickStr(latestCustomerMessage?.text);

  if (!query || !looksLikeProductSearchMessage(query)) {
    return null;
  }

  const searchResult = await buildSearchProductsToolResult({
    query,
    limit: 5,
  });

  return {
    query,
    fromMessageId: String(latestCustomerMessage?._id || ""),
    count: Number(searchResult?.count || 0),
    items: Array.isArray(searchResult?.items) ? searchResult.items : [],
  };
};

const toOrderSummary = (orderDoc) => ({
  id: String(orderDoc._id),
  status: orderDoc.status,
  createdAt: orderDoc.createdAt,
  scheduledAt: orderDoc.scheduledAt || null,
  customer: {
    fullName: orderDoc.customer?.fullName || "",
    phone: orderDoc.customer?.phone || "",
    email: orderDoc.customer?.email || "",
  },
  delivery: {
    method: orderDoc.delivery?.method || "",
    city: orderDoc.delivery?.city || "",
    address: orderDoc.delivery?.address || "",
    npOffice: orderDoc.delivery?.npOffice || "",
  },
  totals: {
    subtotal: Number(orderDoc.totals?.subtotal || 0),
    cartTotal: Number(orderDoc.totals?.cartTotal || 0),
    totalSavings: Number(orderDoc.totals?.totalSavings || 0),
  },
  adminNote: orderDoc.adminNote || "",
  items: Array.isArray(orderDoc.items)
    ? orderDoc.items.map((item) => ({
        productId: String(item.productId || ""),
        name: item.name || "",
        qty: Number(item.qty || 0),
        price: Number(item.price || 0),
        sku: item.sku || "",
      }))
    : [],
});

const toProductSummary = (productDoc) => ({
  id: String(productDoc._id),
  slug: productDoc.slug || "",
  name: {
    ua: productDoc.name?.ua || "",
    en: productDoc.name?.en || "",
  },
  category: productDoc.category || "",
  subCategory: productDoc.subCategory || "",
  typeKey: productDoc.typeKey || "",
  price: Number(productDoc.price || 0),
  discount: Number(productDoc.discount || 0),
  finalPrice:
    Number(productDoc.price || 0) * (1 - Number(productDoc.discount || 0) / 100),
  inStock: !!productDoc.inStock,
  stockQty: Number(productDoc.stockQty || 0),
  status: productDoc.status || "",
  primaryImage: Array.isArray(productDoc.images) ? productDoc.images[0] || "" : "",
  images: Array.isArray(productDoc.images) ? productDoc.images.slice(0, 3) : [],
  apiUrl: `/api/products/by-slug/${encodeURIComponent(productDoc.slug || "")}`,
  storefrontUrl: buildStorefrontProductUrl(productDoc.slug || ""),
});

const buildAiInstructions = ({ chatUser, currentAdmin, additionalInstructions, sendEnabled }) => {
  const roleHint = chatUser.isGuest ? "guest" : "registered customer";
  const sendRule = sendEnabled
    ? "When you are ready to answer the customer, call send_chat_message exactly once with the final reply text. Keep the reply concise and helpful."
    : "Return a concise draft reply for the admin panel. Do not mention internal tools, databases, or hidden notes.";

  return [
    "You are the AI support admin for a furniture and 3D shop backend.",
    "You help human admins answer customer chats using only verified data from the provided tools and context.",
    "Do not invent stock, delivery dates, pricing, addresses, order status, or policy details.",
    "If a question depends on product, order, stock, or location data, use the relevant tool before answering.",
    "For product requests, always call search_products before answering.",
    "When the customer gives a budget like 'до 60000', pass it as maxPrice. When they mention a category like 'дивани', use that category instead of searching the literal generic word 'товари'.",
    "If verifiedCatalogSearch is present in the input, treat it as trusted MongoDB data and use it in the reply.",
    "If the information is not available, say so clearly and offer a human follow-up.",
    "Reply in Ukrainian unless the conversation clearly uses another language.",
    "Do not reveal internal admin names, internal ids, or hidden implementation details to the customer.",
    `The active chat participant is a ${roleHint} with id ${chatUser.id}.`,
    `The human admin who requested this run is ${currentAdmin?.name || currentAdmin?.email || "Admin"}.`,
    sendRule,
    additionalInstructions ? `Extra admin instructions: ${additionalInstructions}` : "",
  ]
    .filter(Boolean)
    .join("\n");
};

const buildSearchOrdersToolResult = async ({ chatUser, query, status, limit }) => {
  const normalizedQuery = pickStr(query);
  const safeLimit = clampInt(limit, 1, 10, 5);
  const filter = {};

  if (status && ["new", "confirmed", "processing", "shipped", "completed", "cancelled"].includes(status)) {
    filter.status = status;
  }

  if (!chatUser.isGuest) {
    filter.user = chatUser.id;
  } else if (!normalizedQuery) {
    return {
      items: [],
      note: "Guest chats are not linked to a user account. Provide an order id, email, or phone to search orders.",
    };
  }

  if (normalizedQuery) {
    const regex = new RegExp(escapeRegex(normalizedQuery), "i");
    const phoneQuery = normalizePhone(normalizedQuery);
    const queryOr = [
      { "customer.fullName": regex },
      { "customer.email": regex },
      { "delivery.city": regex },
    ];

    if (phoneQuery) {
      queryOr.push({ "customer.phone": new RegExp(escapeRegex(phoneQuery), "i") });
    }

    if (isObjectIdLike(normalizedQuery)) {
      queryOr.push({ _id: normalizedQuery });
    }

    if (filter.user) {
      filter.$and = [{ user: filter.user }, { $or: queryOr }];
      delete filter.user;
    } else {
      filter.$or = queryOr;
    }
  }

  const orders = await Order.find(filter)
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .lean();

  return {
    items: orders.map(toOrderSummary),
    count: orders.length,
  };
};

const buildSearchProductsToolResult = async ({
  query,
  category,
  minPrice,
  maxPrice,
  limit,
}) => {
  const normalizedQuery = pickStr(query);
  const safeLimit = clampInt(limit, 1, 10, 5);
  const filter = { status: "active" };
  const andFilters = [];

  const detectedCategory = detectProductCategory(normalizedQuery, category);
  if (detectedCategory) {
    filter.category = detectedCategory;
  }

  const parsedBudget = parseBudgetFromQuery(normalizedQuery);
  const resolvedMinPrice =
    Number.isFinite(Number(minPrice)) && Number(minPrice) > 0
      ? Number(minPrice)
      : parsedBudget.minPrice;
  const resolvedMaxPrice =
    Number.isFinite(Number(maxPrice)) && Number(maxPrice) > 0
      ? Number(maxPrice)
      : parsedBudget.maxPrice;

  if (resolvedMinPrice != null || resolvedMaxPrice != null) {
    const priceExpr = buildEffectivePriceExpr();
    if (resolvedMinPrice != null && resolvedMaxPrice != null) {
      andFilters.push({
        $expr: {
          $and: [
            { $gte: [priceExpr, resolvedMinPrice] },
            { $lte: [priceExpr, resolvedMaxPrice] },
          ],
        },
      });
    } else if (resolvedMinPrice != null) {
      andFilters.push({
        $expr: { $gte: [priceExpr, resolvedMinPrice] },
      });
    } else if (resolvedMaxPrice != null) {
      andFilters.push({
        $expr: { $lte: [priceExpr, resolvedMaxPrice] },
      });
    }
  }

  if (normalizedQuery && !isGenericProductQuery(normalizedQuery) && !detectedCategory) {
    const regex = new RegExp(escapeRegex(normalizedQuery), "i");
    andFilters.push({
      $or: [
      { "name.ua": regex },
      { "name.en": regex },
      { slug: regex },
      { category: regex },
      { subCategory: regex },
      { typeKey: regex },
      ],
    });
  }

  if (andFilters.length === 1) {
    Object.assign(filter, andFilters[0]);
  } else if (andFilters.length > 1) {
    filter.$and = andFilters;
  }

  const products = await Product.find(filter)
    .select("_id slug name category subCategory typeKey price discount inStock stockQty status images")
    .sort({ updatedAt: -1 })
    .limit(safeLimit)
    .lean();

  return {
    query: normalizedQuery,
    category: filter.category || "",
    minPrice: resolvedMinPrice ?? null,
    maxPrice: resolvedMaxPrice ?? null,
    items: products.map(toProductSummary),
    count: products.length,
  };
};

const buildInventoryToolResult = async ({ productId }) => {
  if (!isObjectIdLike(productId)) {
    return { items: [], error: "Invalid productId" };
  }

  const rows = await Inventory.find({ product: productId })
    .populate("location", "type city nameKey addressKey phone workingHours isActive")
    .lean();

  return {
    items: rows.map((row) => ({
      id: String(row._id),
      productId: String(row.product || ""),
      locationId: String(row.location?._id || row.location || ""),
      location: row.location
        ? {
            type: row.location.type || "",
            city: row.location.city || "",
            nameKey: row.location.nameKey || "",
            addressKey: row.location.addressKey || "",
            phone: row.location.phone || "",
            isActive: !!row.location.isActive,
          }
        : null,
      onHand: Number(row.onHand || 0),
      reserved: Number(row.reserved || 0),
      available: Math.max(0, Number(row.onHand || 0) - Number(row.reserved || 0)),
      zone: pickStr(row.zone),
      note: pickStr(row.note),
      isShowcase: !!row.isShowcase,
    })),
    count: rows.length,
  };
};

const buildLocationsToolResult = async ({ onlyActive }) => {
  const filter = onlyActive === false ? {} : { isActive: true };
  const locations = await Location.find(filter)
    .select("_id type city nameKey addressKey phone workingHours isActive")
    .sort({ city: 1, createdAt: -1 })
    .lean();

  return {
    items: locations.map((locationDoc) => ({
      id: String(locationDoc._id),
      type: locationDoc.type || "",
      city: locationDoc.city || "",
      nameKey: locationDoc.nameKey || "",
      addressKey: locationDoc.addressKey || "",
      phone: locationDoc.phone || "",
      workingHours: locationDoc.workingHours || {},
      isActive: !!locationDoc.isActive,
    })),
    count: locations.length,
  };
};

const executeAiTool = async ({
  call,
  args,
  state,
  sendEnabled,
  chatUser,
  aiAdminUser,
  context,
}) => {
  const toolName = call.name;
  state.toolCalls.push({ name: toolName, args });

  if (toolName === "get_chat_context") {
    const historyLimit = clampInt(args.limit, 1, 50, 20);
    return {
      items: context.formattedHistory.slice(-historyLimit),
      count: Math.min(historyLimit, context.formattedHistory.length),
    };
  }

  if (toolName === "get_customer_profile") {
    return {
      id: chatUser.id,
      kind: chatUser.kind,
      isGuest: chatUser.isGuest,
      name: chatUser.name,
      email: chatUser.email || "",
      phone: chatUser.phone || "",
      status: chatUser.status || "active",
    };
  }

  if (toolName === "search_orders") {
    return buildSearchOrdersToolResult({
      chatUser,
      query: args.query,
      status: args.status,
      limit: args.limit,
    });
  }

  if (toolName === "search_products") {
    const result = await buildSearchProductsToolResult({
      query: args.query,
      category: args.category,
      minPrice: args.minPrice,
      maxPrice: args.maxPrice,
      limit: args.limit,
    });
    state.latestProductSearch = result;
    return result;
  }

  if (toolName === "get_inventory") {
    return buildInventoryToolResult({ productId: args.productId });
  }

  if (toolName === "list_locations") {
    return buildLocationsToolResult({ onlyActive: args.onlyActive });
  }

  if (toolName === "send_chat_message") {
    if (!sendEnabled) {
      return { ok: false, error: "Message sending is disabled for this run" };
    }

    const text = applyVerifiedCatalogFallback({
      draft: args.text,
      prefetchedProductSearch: context.prefetchedProductSearch,
    });
    if (!text) {
      return { ok: false, error: "text is required" };
    }

    const savedMessage = await createChatMessage({
      sender: String(aiAdminUser._id),
      receiver: chatUser.id,
      text,
      source: "ai_admin",
      meta: buildAiMessageMeta({
        provider: context.provider || getAiProvider(),
        model: context.model,
        currentAdmin: context.currentAdmin,
        responseId: context.latestResponseId || "",
        productSearch: getResolvedProductSearch({
          toolState: state,
          prefetchedProductSearch: context.prefetchedProductSearch,
        }),
      }),
    });

    state.sentMessage = toSerializableMessage(savedMessage);
    return { ok: true, message: state.sentMessage };
  }

  return { ok: false, error: `Unknown tool: ${toolName}` };
};

const buildAiTools = ({ sendEnabled }) => {
  const tools = [
    {
      type: "function",
      name: "get_chat_context",
      description: "Get recent messages from the current chat thread.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 50 },
        },
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "get_customer_profile",
      description: "Get the current customer or guest profile for the active chat.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "search_orders",
      description:
        "Search orders for the current customer. For guest chats, provide an order id, email, or phone query.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          status: {
            type: "string",
            enum: ["new", "confirmed", "processing", "shipped", "completed", "cancelled"],
          },
          limit: { type: "integer", minimum: 1, maximum: 10 },
        },
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "search_products",
      description:
        "Search products by name, slug, category, type, and budget. Use maxPrice for requests like 'до 60000'.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          category: { type: "string" },
          minPrice: { type: "integer", minimum: 0 },
          maxPrice: { type: "integer", minimum: 0 },
          limit: { type: "integer", minimum: 1, maximum: 10 },
        },
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "get_inventory",
      description: "Get stock by location for a specific product id.",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "string" },
        },
        required: ["productId"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "list_locations",
      description: "List active pickup, office, and warehouse locations.",
      parameters: {
        type: "object",
        properties: {
          onlyActive: { type: "boolean" },
        },
        additionalProperties: false,
      },
    },
  ];

  if (sendEnabled) {
    tools.push({
      type: "function",
      name: "send_chat_message",
      description: "Send the final reply to the active chat participant.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string" },
        },
        required: ["text"],
        additionalProperties: false,
      },
    });
  }

  return tools;
};

export const getAiAdminStatus = async () => {
  const aiUser =
    (await User.findOne({ role: "admin", isAiAssistant: true }).select("_id name email").lean()) || null;
  const provider = getAiProvider();

  return {
    enabled: isAiAdminEnabled(),
    provider,
    model: getAiAdminModel(),
    aiAdmin: aiUser
      ? {
          id: String(aiUser._id),
          name: aiUser.name || aiUser.email || "AI Support",
          email: aiUser.email || "",
        }
      : null,
  };
};

const finalizeAiReply = async ({
  draft,
  toolState,
  model,
  provider,
  aiAdminUser,
  chatUser,
  currentAdmin,
  responseId = "",
  prefetchedProductSearch = null,
}) => {
  const finalDraft = applyVerifiedCatalogFallback({
    draft: pickStr(draft) || pickStr(toolState.sentMessage?.text),
    prefetchedProductSearch,
  });
  const resolvedProductSearch = getResolvedProductSearch({
    toolState,
    prefetchedProductSearch,
  });

  if (currentAdmin?.send && !toolState.sentMessage && finalDraft) {
    const savedMessage = await createChatMessage({
      sender: String(aiAdminUser._id),
      receiver: chatUser.id,
      text: finalDraft,
      source: "ai_admin",
      meta: buildAiMessageMeta({
        provider,
        model,
        currentAdmin,
        responseId,
        productSearch: resolvedProductSearch,
      }),
    });

    toolState.sentMessage = toSerializableMessage(savedMessage);
  }

  return finalDraft;
};

const runOpenAiAdminReply = async ({
  model,
  aiAdminUser,
  chatUser,
  currentAdmin,
  additionalInstructions,
  send,
  formattedHistory,
  responseInput,
  prefetchedProductSearch,
}) => {
  const client = getOpenAiClient();
  const toolState = {
    sentMessage: null,
    toolCalls: [],
    latestProductSearch: null,
  };

  const aiContext = {
    provider: "openai",
    model,
    currentAdmin: currentAdmin || null,
    latestResponseId: "",
    formattedHistory,
    prefetchedProductSearch,
  };

  const tools = buildAiTools({ sendEnabled: send });
  const instructions = buildAiInstructions({
    chatUser,
    currentAdmin,
    additionalInstructions,
    sendEnabled: send,
  });

  let response = await client.responses.create({
    model,
    instructions,
    input: responseInput,
    tools,
    max_output_tokens: 700,
  });

  aiContext.latestResponseId = response.id || "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const functionCalls = Array.isArray(response.output)
      ? response.output.filter((item) => item.type === "function_call")
      : [];

    if (!functionCalls.length) break;

    const toolOutputs = [];

    for (const call of functionCalls) {
      const args = safeParseJson(call.arguments);
      const result = await executeAiTool({
        call,
        args,
        state: toolState,
        sendEnabled: send,
        chatUser,
        aiAdminUser,
        context: { ...aiContext, latestResponseId: response.id || aiContext.latestResponseId },
      });

      toolOutputs.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result),
      });
    }

    response = await client.responses.create({
      model,
      previous_response_id: response.id,
      input: toolOutputs,
      tools,
      max_output_tokens: 700,
    });

    aiContext.latestResponseId = response.id || aiContext.latestResponseId;
  }

  const draft = await finalizeAiReply({
    draft: response.output_text,
    toolState,
    model,
    provider: "openai",
    aiAdminUser,
    chatUser,
    currentAdmin: { ...currentAdmin, send },
    responseId: aiContext.latestResponseId || response.id || "",
    prefetchedProductSearch,
  });
  const products = buildProductCards(
    getResolvedProductSearch({
      toolState,
      prefetchedProductSearch,
    })?.items || []
  );

  return {
    ok: true,
    provider: "openai",
    model,
    draft,
    sent: !!toolState.sentMessage,
    responseId: aiContext.latestResponseId || response.id || "",
    aiAdmin: {
      id: String(aiAdminUser._id),
      name: aiAdminUser.name || aiAdminUser.email || "AI Support",
      email: aiAdminUser.email || "",
    },
    chatUser,
    message: toolState.sentMessage,
    products,
    toolCalls: toolState.toolCalls,
  };
};

const runGeminiAdminReply = async ({
  model,
  aiAdminUser,
  chatUser,
  currentAdmin,
  additionalInstructions,
  send,
  formattedHistory,
  responseInput,
  prefetchedProductSearch,
}) => {
  const toolState = {
    sentMessage: null,
    toolCalls: [],
    latestProductSearch: null,
  };

  const tools = buildAiTools({ sendEnabled: send });
  const instructions = buildAiInstructions({
    chatUser,
    currentAdmin,
    additionalInstructions,
    sendEnabled: send,
  });

  const conversationContents = [createGeminiTextContent("user", responseInput)];
  let finalText = "";
  let latestResponseId = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const responseJson = await callGeminiGenerateContent({
      model,
      systemInstruction: instructions,
      contents: conversationContents,
      tools,
      maxOutputTokens: 700,
    });

    latestResponseId = `gemini-${Date.now()}-${round}`;

    const parsed = extractGeminiCandidate(responseJson);
    finalText = parsed.text || finalText;

    if (parsed.content?.parts?.length) {
      conversationContents.push({
        role: parsed.content.role || "model",
        parts: parsed.content.parts,
      });
    }

    if (!parsed.functionCalls.length) break;

    const functionResponseParts = [];

    for (const call of parsed.functionCalls) {
      const result = await executeAiTool({
        call: {
          name: call.name,
        },
        args: call.args || {},
        state: toolState,
        sendEnabled: send,
        chatUser,
        aiAdminUser,
        context: {
          model,
          provider: "gemini",
          currentAdmin: currentAdmin || null,
          latestResponseId,
          formattedHistory,
          prefetchedProductSearch,
        },
      });

      functionResponseParts.push({
        functionResponse: {
          id: call.id || undefined,
          name: call.name,
          response: result,
        },
      });
    }

    if (functionResponseParts.length) {
      conversationContents.push({
        role: "user",
        parts: functionResponseParts,
      });
    }
  }

  const draft = await finalizeAiReply({
    draft: finalText,
    toolState,
    model,
    provider: "gemini",
    aiAdminUser,
    chatUser,
    currentAdmin: { ...currentAdmin, send },
    responseId: latestResponseId,
    prefetchedProductSearch,
  });
  const products = buildProductCards(
    getResolvedProductSearch({
      toolState,
      prefetchedProductSearch,
    })?.items || []
  );

  return {
    ok: true,
    provider: "gemini",
    model,
    draft,
    sent: !!toolState.sentMessage,
    responseId: latestResponseId,
    aiAdmin: {
      id: String(aiAdminUser._id),
      name: aiAdminUser.name || aiAdminUser.email || "AI Support",
      email: aiAdminUser.email || "",
    },
    chatUser,
    message: toolState.sentMessage,
    products,
    toolCalls: toolState.toolCalls,
  };
};

export const runAiAdminReply = async ({
  chatUserId,
  currentAdmin,
  additionalInstructions = "",
  send = false,
  historyLimit = 30,
}) => {
  const provider = getAiProvider();
  const model = getAiAdminModel();
  const aiAdminUser = await ensureAiAdminUser();
  const chatUser = await findChatUser(chatUserId);
  const { adminMap } = await loadAdminIndex();

  const rawHistory = await getExternalConversationHistory(chatUser.id);
  const safeHistoryLimit = clampInt(historyLimit, 5, 60, 30);
  const history = rawHistory.slice(-safeHistoryLimit);
  const formattedHistory = formatConversationForModel({
    history,
    adminMap,
    chatUser,
  });
  const latestCustomerMessage = getLatestCustomerMessage({ history, chatUser });
  const prefetchedProductSearch = await buildPrefetchedProductSearch({
    history,
    chatUser,
  });

  const responseInput = JSON.stringify(
    {
      currentChatUser: {
        id: chatUser.id,
        name: chatUser.name,
        isGuest: chatUser.isGuest,
        email: chatUser.email || "",
        status: chatUser.status || "active",
      },
      latestCustomerMessage: latestCustomerMessage
        ? {
            id: String(latestCustomerMessage._id || ""),
            text: pickStr(latestCustomerMessage.text),
            at: latestCustomerMessage.createdAt,
          }
        : null,
      verifiedCatalogSearch: prefetchedProductSearch
        ? {
            source: "mongodb",
            query: prefetchedProductSearch.query,
            count: prefetchedProductSearch.count,
            items: prefetchedProductSearch.items,
          }
        : null,
      recentMessages: formattedHistory,
      adminRequest: {
        sendImmediately: !!send,
        additionalInstructions: pickStr(additionalInstructions),
      },
    },
    null,
    2
  );

  const buildDbFallbackReply = async (error, productSearch = prefetchedProductSearch) => {
    const fallbackDraft = applyVerifiedCatalogFallback({
      draft: "",
      prefetchedProductSearch: productSearch,
    });

    if (!fallbackDraft) {
      throw error;
    }

    let savedMessage = null;
    const fallbackResponseId = `fallback-db-${Date.now()}`;
    if (send) {
      savedMessage = await createChatMessage({
        sender: String(aiAdminUser._id),
        receiver: chatUser.id,
        text: fallbackDraft,
        source: "ai_admin",
        meta: buildAiMessageMeta({
          provider,
          model,
          currentAdmin,
          responseId: fallbackResponseId,
          productSearch,
          fallbackReason: error?.message || "verified catalog fallback",
        }),
      });
    }

    const products = buildProductCards(productSearch?.items || []);

    return {
      ok: true,
      provider,
      model,
      draft: fallbackDraft,
      sent: !!savedMessage,
      responseId: fallbackResponseId,
      aiAdmin: {
        id: String(aiAdminUser._id),
        name: aiAdminUser.name || aiAdminUser.email || "AI Support",
        email: aiAdminUser.email || "",
      },
      chatUser,
      message: savedMessage ? toSerializableMessage(savedMessage) : null,
      products,
      toolCalls: productSearch
        ? [
            {
              name: "prefetched_catalog_search",
              args: {
                query: productSearch.query,
                count: productSearch.count,
                fallback: true,
              },
            },
          ]
        : [],
      fallback: true,
      fallbackReason: error?.message || "verified catalog fallback",
    };
  };

  try {
    if (provider === "gemini") {
      return await runGeminiAdminReply({
        model,
        aiAdminUser,
        chatUser,
        currentAdmin,
        additionalInstructions,
        send,
        formattedHistory,
        responseInput,
        prefetchedProductSearch,
      });
    }

    return await runOpenAiAdminReply({
      model,
      aiAdminUser,
      chatUser,
      currentAdmin,
      additionalInstructions,
      send,
      formattedHistory,
      responseInput,
      prefetchedProductSearch,
    });
  } catch (error) {
    if (prefetchedProductSearch?.count) {
      return buildDbFallbackReply(error);
    }

    const latestCustomerQuery = pickStr(latestCustomerMessage?.text);
    if (looksLikeProductSearchMessage(latestCustomerQuery)) {
      const emergencyProductSearch = await buildSearchProductsToolResult({
        query: latestCustomerQuery,
        limit: 5,
      });

      if (emergencyProductSearch?.count) {
        return buildDbFallbackReply(error, emergencyProductSearch);
      }
    }

    throw error;
  }
};
