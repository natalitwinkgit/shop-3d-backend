import {
  createProductQuestion,
  getProductQuestionById,
  listProductQuestions,
  pickProductQuestionReplyMessage,
  replyToProductQuestion,
  updateProductQuestionReadState,
  updateProductQuestionStatus,
} from "../services/productQuestionService.js";

const hasHoneypotSignal = (body = {}) =>
  ["website", "company", "honeypot"].some((field) => String(body?.[field] || "").trim());

export const createProductQuestionHandler = async (req, res, next) => {
  try {
    if (hasHoneypotSignal(req.body)) {
      return res.status(202).json({ ok: true });
    }

    const question = await createProductQuestion(req.body, { currentUser: req.user || null });
    return res.status(201).json({ ok: true, question });
  } catch (error) {
    return next(error);
  }
};

export const adminListProductQuestions = async (req, res, next) => {
  try {
    return res.json(await listProductQuestions(req.query));
  } catch (error) {
    return next(error);
  }
};

export const adminGetProductQuestion = async (req, res, next) => {
  try {
    return res.json(await getProductQuestionById(req.params.id));
  } catch (error) {
    return next(error);
  }
};

export const adminReplyToProductQuestion = async (req, res, next) => {
  try {
    const result = await replyToProductQuestion({
      questionId: req.params.id,
      message: pickProductQuestionReplyMessage(req.body),
      status: req.body?.status || "answered",
      adminUser: req.user,
    });

    return res.json({ ok: true, ...result });
  } catch (error) {
    return next(error);
  }
};

export const adminUpdateProductQuestionStatus = async (req, res, next) => {
  try {
    const question = await updateProductQuestionStatus({
      questionId: req.params.id,
      status: req.body?.status,
    });
    return res.json({ ok: true, question });
  } catch (error) {
    return next(error);
  }
};

export const adminUpdateProductQuestionReadState = async (req, res, next) => {
  try {
    const question = await updateProductQuestionReadState({
      questionId: req.params.id,
      isRead: req.body?.isRead ?? true,
    });
    return res.json({ ok: true, question });
  } catch (error) {
    return next(error);
  }
};
