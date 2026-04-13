import crypto from "crypto";

const buildRequestId = () => {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const attachRequestContext = (req, res, next) => {
  const incomingRequestId = String(req.headers["x-request-id"] || "").trim();
  const requestId = incomingRequestId || buildRequestId();

  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
};
