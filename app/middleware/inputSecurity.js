const SCRIPT_TAG_RE = /<\s*\/?\s*script\b[^>]*>/gi;
const STYLE_TAG_RE = /<\s*\/?\s*style\b[^>]*>/gi;
const JS_PROTOCOL_RE = /javascript\s*:/gi;
const INLINE_HANDLER_RE = /\son[a-z]+\s*=/gi;
const DANGEROUS_KEY_RE = /^\$|[.]/;

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
      Object.entries(value)
        .filter(([key]) => !DANGEROUS_KEY_RE.test(String(key || "")))
        .map(([key, item]) => [key, sanitizeDeep(item)])
    );
  }
  return value;
};

export const sanitizeRequestBody = (req, _res, next) => {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeDeep(req.body);
  }
  if (req.query && typeof req.query === "object") {
    req.query = sanitizeDeep(req.query);
  }
  next();
};

export const sanitizeInputForSecurity = sanitizeDeep;
