const SCRIPT_TAG_RE = /<\s*\/?\s*script\b[^>]*>/gi;
const STYLE_TAG_RE = /<\s*\/?\s*style\b[^>]*>/gi;
const JS_PROTOCOL_RE = /javascript\s*:/gi;
const INLINE_HANDLER_RE = /\son[a-z]+\s*=/gi;

const sanitizeString = (value) =>
  String(value || "")
    .replace(SCRIPT_TAG_RE, "")
    .replace(STYLE_TAG_RE, "")
    .replace(JS_PROTOCOL_RE, "")
    .replace(INLINE_HANDLER_RE, " ");

const sanitizeDeep = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeDeep(item));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeDeep(item)])
    );
  }
  return value;
};

export const sanitizeRequestBody = (req, _res, next) => {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeDeep(req.body);
  }
  next();
};
