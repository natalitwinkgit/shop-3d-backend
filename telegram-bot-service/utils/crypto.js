import crypto from "crypto";

import { telegramEnv } from "../config/env.js";

export const generateNumericCode = (digits = 6) => {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits - 1;
  return String(crypto.randomInt(min, max + 1));
};

export const generateOpaqueToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");

export const hashSecret = (value) =>
  crypto
    .createHmac("sha256", telegramEnv.tokenPepper)
    .update(String(value || ""))
    .digest("hex");

export const toExpiryDate = (minutes) => new Date(Date.now() + Number(minutes || 0) * 60 * 1000);

export const safeUserId = (value) => String(value || "").trim();
