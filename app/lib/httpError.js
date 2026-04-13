import { ERROR_CODES } from "../constants/errorCodes.js";

export const createAppError = ({
  statusCode = 500,
  code = ERROR_CODES.INTERNAL_ERROR,
  message = "Server error",
  details = null,
} = {}) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
};
