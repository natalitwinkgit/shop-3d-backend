import crypto from "crypto";
import jwt from "jsonwebtoken";

import User, { isAdminRole } from "../models/userModel.js";
import { getSupportAdminProfile } from "./adminChatService.js";

const GUEST_CHAT_TOKEN_TYPE = "chat_guest";
const GUEST_CHAT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const GUEST_NAME_MAX_LENGTH = 80;

const pickStr = (value) => String(value || "").trim();

const getJwtSecret = () => {
  const secret = pickStr(process.env.JWT_SECRET);
  if (!secret) {
    const error = new Error("JWT_SECRET is not configured");
    error.statusCode = 500;
    throw error;
  }

  return secret;
};

const normalizeGuestName = (value) => {
  const normalized = pickStr(value).slice(0, GUEST_NAME_MAX_LENGTH);
  return normalized || "Guest";
};

const buildGuestId = () => `guest_${crypto.randomBytes(12).toString("hex")}`;

export const extractSocketAccessToken = (socket) => {
  const authToken = pickStr(socket.handshake?.auth?.token);
  if (authToken) return authToken;

  const guestToken = pickStr(socket.handshake?.auth?.guestToken);
  if (guestToken) return guestToken;

  const headerAuth = pickStr(socket.handshake?.headers?.authorization);
  if (headerAuth.toLowerCase().startsWith("bearer ")) {
    return headerAuth.slice(7).trim();
  }

  const queryToken = pickStr(socket.handshake?.query?.token);
  if (queryToken) return queryToken;

  return "";
};

export const resolveChatSessionFromToken = async (token) => {
  const accessToken = pickStr(token);
  if (!accessToken) {
    const error = new Error("CHAT_AUTH_REQUIRED");
    error.statusCode = 401;
    throw error;
  }

  let decoded;
  try {
    decoded = jwt.verify(accessToken, getJwtSecret());
  } catch (error) {
    const authError = new Error(
      error?.name === "TokenExpiredError" ? "CHAT_TOKEN_EXPIRED" : "CHAT_TOKEN_INVALID"
    );
    authError.statusCode = 401;
    throw authError;
  }

  if (decoded?.type === GUEST_CHAT_TOKEN_TYPE) {
    const guestId = pickStr(decoded.guestId);
    if (!guestId.startsWith("guest_")) {
      const error = new Error("CHAT_GUEST_INVALID");
      error.statusCode = 401;
      throw error;
    }

    return {
      kind: "guest",
      id: guestId,
      role: "guest",
      isAdmin: false,
      guestName: normalizeGuestName(decoded.guestName),
    };
  }

  const user = await User.findById(decoded?.id).select(
    "_id name email role status isAiAssistant"
  );

  if (!user) {
    const error = new Error("CHAT_USER_NOT_FOUND");
    error.statusCode = 401;
    throw error;
  }

  if (user.status === "banned") {
    const error = new Error("CHAT_USER_BANNED");
    error.statusCode = 403;
    throw error;
  }

  return {
    kind: "user",
    id: String(user._id),
    role: pickStr(user.role) || "user",
    isAdmin: isAdminRole(user.role),
    name: pickStr(user.name),
    email: pickStr(user.email),
    isAiAssistant: !!user.isAiAssistant,
  };
};

export const createGuestChatSession = async ({ guestName = "" } = {}) => {
  const supportAdmin = await getSupportAdminProfile();
  if (!supportAdmin?.adminId) {
    const error = new Error("Support admin is unavailable");
    error.statusCode = 503;
    throw error;
  }

  const expiresAt = new Date(Date.now() + GUEST_CHAT_TOKEN_TTL_MS);
  const guestId = buildGuestId();
  const normalizedGuestName = normalizeGuestName(guestName);
  const token = jwt.sign(
    {
      type: GUEST_CHAT_TOKEN_TYPE,
      guestId,
      guestName: normalizedGuestName,
    },
    getJwtSecret(),
    { expiresIn: Math.floor(GUEST_CHAT_TOKEN_TTL_MS / 1000) }
  );

  return {
    guestId,
    guestName: normalizedGuestName,
    token,
    expiresAt: expiresAt.toISOString(),
    supportAdmin: {
      adminId: supportAdmin.adminId,
      adminName: supportAdmin.adminName || "Admin",
      isAiAssistant: !!supportAdmin.isAiAssistant,
    },
  };
};
