import { ERROR_CODES } from "../constants/errorCodes.js";

export const apiNotFoundHandler = (req, res) => {
  res.status(404).json({
    code: ERROR_CODES.API_ROUTE_NOT_FOUND,
    message: "API route not found",
    details: null,
    path: req.originalUrl,
    requestId: req.requestId || "-",
  });
};
