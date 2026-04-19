import { ERROR_CODES } from "../app/constants/errorCodes.js";
import { createAppError } from "../app/lib/httpError.js";
import { logger } from "../app/lib/logger.js";
import { env } from "../config/env.js";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const pickStr = (value) => String(value ?? "").trim();

const throwHttpError = (statusCode, message, code = ERROR_CODES.REQUEST_ERROR) => {
  throw createAppError({ statusCode, code, message });
};

export const isTurnstileEnabled = () => Boolean(env.turnstile?.secretKey);

export const verifyTurnstileToken = async (
  token,
  { remoteIp = "", fetchImpl = globalThis.fetch } = {}
) => {
  if (!isTurnstileEnabled()) {
    return { enabled: false, success: true, reason: "DISABLED" };
  }

  const safeToken = pickStr(token);
  if (!safeToken) {
    throwHttpError(400, "captchaToken is required", ERROR_CODES.VALIDATION_ERROR);
  }
  if (typeof fetchImpl !== "function") {
    throwHttpError(500, "Bot verification is not available");
  }

  const body = new URLSearchParams({
    secret: env.turnstile.secretKey,
    response: safeToken,
  });
  const safeRemoteIp = pickStr(remoteIp);
  if (safeRemoteIp) {
    body.set("remoteip", safeRemoteIp);
  }

  let response;
  try {
    response = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
  } catch (error) {
    logger.warn("Turnstile verification request failed", { remoteIp: safeRemoteIp }, error);
    throwHttpError(503, "Bot verification is temporarily unavailable");
  }

  if (!response?.ok) {
    logger.warn("Turnstile verification responded with non-OK status", {
      status: response?.status || 0,
    });
    throwHttpError(503, "Bot verification is temporarily unavailable");
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    logger.warn("Turnstile verification returned invalid JSON", {}, error);
    throwHttpError(503, "Bot verification is temporarily unavailable");
  }

  const success = Boolean(payload?.success);
  const score = Number(payload?.score || 0);
  if (!success) {
    throwHttpError(400, "Bot verification failed", ERROR_CODES.VALIDATION_ERROR);
  }

  if (env.turnstile.minScore > 0 && Number.isFinite(score) && score < env.turnstile.minScore) {
    throwHttpError(400, "Bot verification failed", ERROR_CODES.VALIDATION_ERROR);
  }

  return {
    enabled: true,
    success: true,
    hostname: pickStr(payload?.hostname),
    action: pickStr(payload?.action),
    challengeTs: pickStr(payload?.challenge_ts),
    score,
  };
};
