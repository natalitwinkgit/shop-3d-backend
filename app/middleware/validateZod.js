import { ZodError } from "zod";
import { ERROR_CODES } from "../constants/errorCodes.js";
import { createAppError } from "../lib/httpError.js";

export const validateZodBody = (schema) => (req, _res, next) => {
  try {
    req.body = schema.parse(req.body || {});
    return next();
  } catch (error) {
    if (error instanceof ZodError) {
      return next(
        createAppError({
          statusCode: 400,
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Request body validation failed",
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        })
      );
    }
    return next(error);
  }
};
