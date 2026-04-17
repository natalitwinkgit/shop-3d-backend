import express from "express";
import { z } from "zod";

import { validateZodBody } from "../app/middleware/validateZod.js";
import { createProductQuestionHandler } from "../controllers/productQuestionController.js";
import { optionalAuth } from "../middleware/authMiddleware.js";
import { createRateLimit } from "../middleware/rateLimitMiddleware.js";
import {
  PRODUCT_QUESTION_MESSAGE_MAX_LENGTH,
  normalizeCustomerEmail,
} from "../services/productQuestionService.js";

const router = express.Router();

const questionCreateRateLimit = createRateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: "Too many product question requests. Please try again later.",
  keyGenerator: (req) => {
    const email = normalizeCustomerEmail(
      req.body?.customer?.email || req.body?.customerEmail || req.body?.email
    );
    return `${req.ip}:product-question:${req.body?.productId || "unknown"}:${email || "guest"}`;
  },
});

const trimString = (value) => String(value ?? "").trim();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const customerSchema = z.object({
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().max(254).optional(),
  phone: z.string().trim().max(40).optional(),
});

const createProductQuestionSchema = z
  .object({
    productId: z.string().trim().min(1),
    customer: customerSchema.optional(),
    customerName: z.string().trim().max(120).optional(),
    customerEmail: z.string().trim().max(254).optional(),
    customerPhone: z.string().trim().max(40).optional(),
    name: z.string().trim().max(120).optional(),
    email: z.string().trim().max(254).optional(),
    phone: z.string().trim().max(40).optional(),
    message: z.string().trim().max(PRODUCT_QUESTION_MESSAGE_MAX_LENGTH).optional(),
    question: z.string().trim().max(PRODUCT_QUESTION_MESSAGE_MAX_LENGTH).optional(),
    source: z
      .enum(["product_page", "product-page", "api", "chat", "admin"])
      .optional()
      .default("product_page"),
    locale: z.string().trim().max(12).optional(),
    productName: z.string().trim().max(240).optional(),
    sku: z.string().trim().max(120).optional(),
    pageUrl: z.string().trim().max(1000).optional(),
    productUrl: z.string().trim().max(1000).optional(),
    captchaToken: z.string().trim().max(2000).optional(),
    website: z.string().trim().max(200).optional(),
    company: z.string().trim().max(200).optional(),
    honeypot: z.string().trim().max(200).optional(),
  })
  .passthrough()
  .superRefine((body, ctx) => {
    const name = trimString(body.customer?.name || body.customerName || body.name);
    const email = trimString(body.customer?.email || body.customerEmail || body.email);
    const phone = trimString(body.customer?.phone || body.customerPhone || body.phone);
    const message = trimString(body.message || body.question);

    if (name.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["name"],
        message: "name is required",
      });
    }

    if (!email && !phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "email or phone is required",
      });
    }

    if (email && !EMAIL_RE.test(email)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "email is invalid",
      });
    }

    if (message.length < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["message"],
        message: "message is required",
      });
    }
  });

router.post(
  "/",
  questionCreateRateLimit,
  validateZodBody(createProductQuestionSchema),
  optionalAuth,
  createProductQuestionHandler
);

export default router;
