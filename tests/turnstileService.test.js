import assert from "node:assert/strict";
import test from "node:test";

import { env } from "../config/env.js";
import { verifyTurnstileToken } from "../services/turnstileService.js";

test("verifyTurnstileToken skips verification when turnstile is disabled", async () => {
  const originalSecretKey = env.turnstile.secretKey;

  env.turnstile.secretKey = "";

  try {
    const result = await verifyTurnstileToken("");
    assert.equal(result.enabled, false);
    assert.equal(result.success, true);
  } finally {
    env.turnstile.secretKey = originalSecretKey;
  }
});

test("verifyTurnstileToken posts token and remote ip to turnstile", async () => {
  const originalSecretKey = env.turnstile.secretKey;
  const originalMinScore = env.turnstile.minScore;

  env.turnstile.secretKey = "turnstile-secret";
  env.turnstile.minScore = 0;

  let fetchArgs = null;

  try {
    const result = await verifyTurnstileToken("token-123", {
      remoteIp: "203.0.113.9",
      fetchImpl: async (...args) => {
        fetchArgs = args;
        return {
          ok: true,
          async json() {
            return {
              success: true,
              hostname: "localhost",
              action: "product_question",
              challenge_ts: "2026-04-19T20:00:00.000Z",
            };
          },
        };
      },
    });

    assert.equal(result.enabled, true);
    assert.equal(result.success, true);
    assert.equal(result.hostname, "localhost");
    assert.equal(fetchArgs[0], "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.equal(fetchArgs[1].method, "POST");
    assert.equal(fetchArgs[1].body.get("secret"), "turnstile-secret");
    assert.equal(fetchArgs[1].body.get("response"), "token-123");
    assert.equal(fetchArgs[1].body.get("remoteip"), "203.0.113.9");
  } finally {
    env.turnstile.secretKey = originalSecretKey;
    env.turnstile.minScore = originalMinScore;
  }
});

test("verifyTurnstileToken rejects invalid or missing tokens when turnstile is enabled", async () => {
  const originalSecretKey = env.turnstile.secretKey;

  env.turnstile.secretKey = "turnstile-secret";

  try {
    await assert.rejects(() => verifyTurnstileToken(""), {
      message: "captchaToken is required",
    });

    await assert.rejects(
      () =>
        verifyTurnstileToken("bad-token", {
          fetchImpl: async () => ({
            ok: true,
            async json() {
              return { success: false, "error-codes": ["invalid-input-response"] };
            },
          }),
        }),
      {
        message: "Bot verification failed",
      }
    );
  } finally {
    env.turnstile.secretKey = originalSecretKey;
  }
});
