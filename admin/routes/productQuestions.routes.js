import { Router } from "express";
import { z } from "zod";

import { validateZodBody } from "../../app/middleware/validateZod.js";
import {
  adminGetProductQuestion,
  adminListProductQuestions,
  adminReplyToProductQuestion,
  adminUpdateProductQuestionReadState,
  adminUpdateProductQuestionStatus,
} from "../../controllers/productQuestionController.js";
import {
  PRODUCT_QUESTION_REPLY_MAX_LENGTH,
} from "../../services/productQuestionService.js";

const router = Router();

const statusSchema = z.object({
  status: z.enum(["new", "answered", "closed", "spam"]),
});

const optionalReplyText = z.string().trim().max(PRODUCT_QUESTION_REPLY_MAX_LENGTH).optional();

const replySchema = z
  .object({
    message: optionalReplyText,
    answer: optionalReplyText,
    answerText: optionalReplyText,
    replyText: optionalReplyText,
    status: z.enum(["new", "answered", "closed", "spam"]).optional().default("answered"),
  })
  .passthrough()
  .superRefine((body, ctx) => {
    const replyText = String(
      body.message ?? body.answer ?? body.answerText ?? body.replyText ?? ""
    ).trim();

    if (!replyText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["message"],
        message: "reply message is required",
      });
    }
  });

const readSchema = z.object({
  isRead: z.boolean().optional().default(true),
});

router.get("/product-questions", adminListProductQuestions);
router.get("/product-questions/:id", adminGetProductQuestion);
router.post(
  "/product-questions/:id/reply",
  validateZodBody(replySchema),
  adminReplyToProductQuestion
);
router.patch(
  "/product-questions/:id/status",
  validateZodBody(statusSchema),
  adminUpdateProductQuestionStatus
);
router.patch(
  "/product-questions/:id/read",
  validateZodBody(readSchema),
  adminUpdateProductQuestionReadState
);

export default router;
