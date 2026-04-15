import crypto from "crypto";

const pickIp = (req) =>
  String(req.ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").trim();

const normalizeIp = (rawIp) => {
  const ip = String(rawIp || "").split(",")[0].trim();
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  return ip || "unknown";
};

export const buildRequestFingerprint = (req) => {
  const ipPart = normalizeIp(pickIp(req));
  const ua = String(req.headers["user-agent"] || "").trim().toLowerCase();
  const source = `${ipPart}|${ua}`;
  return crypto.createHash("sha256").update(source).digest("hex");
};
