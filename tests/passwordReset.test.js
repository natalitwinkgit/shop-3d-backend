import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import {
  PASSWORD_RESET_PUBLIC_MESSAGE,
  hashPasswordResetToken,
  requestPasswordReset,
  resetPasswordWithToken,
} from "../services/passwordResetService.js";
import { buildPasswordResetEmail } from "../services/emailService.js";
import { env } from "../config/env.js";

const makeQuery = (doc) => ({
  select() {
    return Promise.resolve(doc);
  },
});

const makeUserDoc = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  name: "Test User",
  email: "user@example.com",
  status: "active",
  resetPasswordTokenHash: "",
  resetPasswordExpiresAt: null,
  resetPasswordRequestedAt: null,
  passwordHash: "",
  password: "",
  lastLogoutAt: null,
  lastSeen: null,
  lastActivityAt: null,
  saveCalls: 0,
  async save() {
    this.saveCalls += 1;
    return this;
  },
  ...overrides,
});

test("requestPasswordReset stores token hash and sends reset email", async () => {
  const user = makeUserDoc();
  const sent = [];
  const now = new Date("2026-04-17T10:00:00.000Z");
  const token = "fixed-reset-token";
  const userModel = {
    findOne(filter) {
      assert.deepEqual(filter, { email: "user@example.com" });
      return makeQuery(user);
    },
  };

  const result = await requestPasswordReset(
    { email: " USER@EXAMPLE.COM " },
    {
      userModel,
      now: () => now,
      tokenFactory: () => token,
      sendResetEmail: async (payload) => {
        sent.push(payload);
        return { sent: true };
      },
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.emailSent, true);
  assert.equal(user.resetPasswordTokenHash, hashPasswordResetToken(token));
  assert.equal(user.resetPasswordRequestedAt.toISOString(), now.toISOString());
  assert.equal(user.resetPasswordExpiresAt.getTime(), now.getTime() + 60 * 60 * 1000);
  assert.equal(user.saveCalls, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].token, token);
});

test("requestPasswordReset does not reveal missing accounts", async () => {
  let sent = false;
  const userModel = {
    findOne() {
      return makeQuery(null);
    },
  };

  const result = await requestPasswordReset(
    { email: "missing@example.com" },
    {
      userModel,
      sendResetEmail: async () => {
        sent = true;
        return { sent: true };
      },
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.emailSent, false);
  assert.equal(sent, false);
  assert.equal(PASSWORD_RESET_PUBLIC_MESSAGE, "If the account exists, reset instructions will be sent");
});

test("resetPasswordWithToken updates password and clears reset token", async () => {
  const token = "valid-reset-token";
  const now = new Date("2026-04-17T11:00:00.000Z");
  const user = makeUserDoc({
    resetPasswordTokenHash: hashPasswordResetToken(token),
    resetPasswordExpiresAt: new Date(now.getTime() + 1000),
  });

  const userModel = {
    findOne(filter) {
      assert.equal(filter.resetPasswordTokenHash, hashPasswordResetToken(token));
      assert.deepEqual(filter.resetPasswordExpiresAt, { $gt: now });
      return makeQuery(user);
    },
  };

  const result = await resetPasswordWithToken(
    {
      token,
      password: "new-password",
      confirmPassword: "new-password",
    },
    { userModel, now: () => now }
  );

  assert.equal(result.ok, true);
  assert.equal(await bcrypt.compare("new-password", user.passwordHash), true);
  assert.equal(user.password, undefined);
  assert.equal(user.resetCode, undefined);
  assert.equal(user.resetPasswordTokenHash, "");
  assert.equal(user.resetPasswordExpiresAt, null);
  assert.equal(user.resetPasswordRequestedAt, null);
  assert.equal(user.lastLogoutAt, now);
  assert.equal(user.saveCalls, 1);
});

test("resetPasswordWithToken rejects mismatched passwords", async () => {
  await assert.rejects(
    () =>
      resetPasswordWithToken({
        token: "valid-reset-token",
        password: "new-password",
        confirmPassword: "other-password",
      }),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.equal(error.message, "Passwords do not match");
      return true;
    }
  );
});

test("buildPasswordResetEmail creates frontend reset link", () => {
  const previousResetUrl = env.passwordResetUrl;
  env.passwordResetUrl = "https://shop.example/reset-password";

  try {
    const email = buildPasswordResetEmail({
      user: { name: "Ivan", email: "ivan@example.com" },
      token: "abc 123",
      expiresAt: new Date("2026-04-17T12:00:00.000Z"),
    });

    assert.equal(email.to, "ivan@example.com");
    assert.match(email.subject, /Відновлення пароля/);
    assert.match(email.text, /token=abc%20123/);
    assert.match(email.html, /token=abc%20123/);
  } finally {
    env.passwordResetUrl = previousResetUrl;
  }
});
