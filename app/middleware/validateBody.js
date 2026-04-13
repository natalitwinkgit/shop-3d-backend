const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const getAtPath = (obj, path) => {
  const parts = String(path || "").split(".");
  let current = obj;
  for (const part of parts) {
    if (!isPlainObject(current) || !(part in current)) return undefined;
    current = current[part];
  }
  return current;
};

const isEmpty = (value) => value === undefined || value === null || String(value).trim() === "";

const ensureType = (value, type) => {
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isPlainObject(value);
  return true;
};

export const validateBody = (schema = []) => (req, res, next) => {
  try {
    const body = req.body || {};

    for (const rule of schema) {
      const field = String(rule.field || "");
      const value = getAtPath(body, field);

      if (rule.required && isEmpty(value)) {
        return res.status(400).json({ message: `${field} is required` });
      }
      if (isEmpty(value)) continue;

      if (rule.type && !ensureType(value, rule.type)) {
        return res.status(400).json({ message: `${field} must be ${rule.type}` });
      }

      if (rule.minLength && String(value).trim().length < rule.minLength) {
        return res
          .status(400)
          .json({ message: `${field} must contain at least ${rule.minLength} characters` });
      }

      if (rule.enum && !rule.enum.includes(value)) {
        return res.status(400).json({
          message: `${field} must be one of: ${rule.enum.join(", ")}`,
        });
      }
    }

    return next();
  } catch (error) {
    return res.status(400).json({ message: "Invalid request body", error: String(error?.message || error) });
  }
};
