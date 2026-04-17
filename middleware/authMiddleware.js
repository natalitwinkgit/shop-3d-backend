import jwt from "jsonwebtoken";
import { ERROR_CODES } from "../app/constants/errorCodes.js";
import { buildRequestFingerprint } from "../app/lib/securityFingerprint.js";
import { logger } from "../app/lib/logger.js";
import { env } from "../config/env.js";
import User, { ADMIN_ROLES, isAdminRole } from "../models/userModel.js";

const getTokenFromReq = (req) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    return { token: auth.split(" ")[1], source: "bearer" };
  }

  if (env.allowCookieAuth) {
    const cookieToken = req.cookies?.token || req.cookies?.jwt || null;
    if (cookieToken) return { token: cookieToken, source: "cookie" };
  }

  return { token: null, source: "" };
};

const touchPresenceIfNeeded = async (user) => {
  const now = new Date();
  const lastSeenTs = new Date(user.lastSeen || 0).getTime();
  const shouldTouchPresence =
    !user.isOnline || !lastSeenTs || now.getTime() - lastSeenTs > 30 * 1000;

  if (!shouldTouchPresence) return user;

  return User.findByIdAndUpdate(
    user._id,
    {
      $set: {
        isOnline: true,
        presence: "online",
        lastSeen: now,
        lastActivityAt: now,
      },
    },
    { new: true }
  ).select("-passwordHash -password");
};

export const requireAuth = async (req, res, next) => {
  try {
    const { token } = getTokenFromReq(req);
    if (!token) {
      return res.status(401).json({ code: ERROR_CODES.UNAUTHORIZED, message: "Unauthorized" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        code: ERROR_CODES.SERVER_ERROR,
        message: "JWT_SECRET is not configured",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (error?.name === "TokenExpiredError") {
        return res
          .status(401)
          .json({ code: ERROR_CODES.TOKEN_EXPIRED, message: "Token expired" });
      }
      return res
        .status(401)
        .json({ code: ERROR_CODES.INVALID_TOKEN, message: "Invalid token" });
    }

    const user = await User.findById(decoded.id).select("-passwordHash -password");
    if (!user) {
      return res.status(401).json({ code: ERROR_CODES.UNAUTHORIZED, message: "Unauthorized" });
    }

    if (user.status === "banned") {
      return res.status(403).json({ code: ERROR_CODES.FORBIDDEN, message: "User is banned" });
    }

    if (decoded?.iat && user.lastLogoutAt) {
      const tokenIssuedAtMs = Number(decoded.iat) * 1000;
      const lastLogoutAtMs = new Date(user.lastLogoutAt).getTime();
      if (Number.isFinite(tokenIssuedAtMs) && Number.isFinite(lastLogoutAtMs) && tokenIssuedAtMs < lastLogoutAtMs) {
        return res
          .status(401)
          .json({ code: ERROR_CODES.SESSION_REVOKED, message: "Session has been revoked" });
      }
    }

    const bindingMode =
      env.sessionBindingMode !== "off"
        ? env.sessionBindingMode
        : env.sessionBindingEnabled
          ? "enforce"
          : "off";

    if (bindingMode !== "off") {
      const expectedFingerprint = buildRequestFingerprint(req);
      const mismatch = !decoded?.fp || decoded.fp !== expectedFingerprint;
      if (mismatch) {
        if (bindingMode === "report") {
          logger.warn("Session fingerprint mismatch (report mode)", {
            path: req.originalUrl,
            userId: String(user?._id || ""),
          });
        } else {
          return res.status(401).json({
            code: ERROR_CODES.SESSION_REVOKED,
            message: "Session fingerprint mismatch",
          });
        }
      }
    }

    req.user = await touchPresenceIfNeeded(user);
    return next();
  } catch (error) {
    logger.error("Authorization middleware error", { path: req.originalUrl }, error);
    return res
      .status(500)
      .json({ code: ERROR_CODES.SERVER_ERROR, message: "Authorization error" });
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    const { token } = getTokenFromReq(req);
    if (!token) return next();

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        code: ERROR_CODES.SERVER_ERROR,
        message: "JWT_SECRET is not configured",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (error?.name === "TokenExpiredError") {
        return res
          .status(401)
          .json({ code: ERROR_CODES.TOKEN_EXPIRED, message: "Token expired" });
      }
      return res
        .status(401)
        .json({ code: ERROR_CODES.INVALID_TOKEN, message: "Invalid token" });
    }

    const user = await User.findById(decoded.id).select("-passwordHash -password");
    if (!user) return next();

    if (user.status === "banned") {
      return res.status(403).json({ code: ERROR_CODES.FORBIDDEN, message: "User is banned" });
    }

    if (decoded?.iat && user.lastLogoutAt) {
      const tokenIssuedAtMs = Number(decoded.iat) * 1000;
      const lastLogoutAtMs = new Date(user.lastLogoutAt).getTime();
      if (Number.isFinite(tokenIssuedAtMs) && Number.isFinite(lastLogoutAtMs) && tokenIssuedAtMs < lastLogoutAtMs) {
        return res
          .status(401)
          .json({ code: ERROR_CODES.SESSION_REVOKED, message: "Session has been revoked" });
      }
    }

    const bindingMode =
      env.sessionBindingMode !== "off"
        ? env.sessionBindingMode
        : env.sessionBindingEnabled
          ? "enforce"
          : "off";

    if (bindingMode !== "off") {
      const expectedFingerprint = buildRequestFingerprint(req);
      const mismatch = !decoded?.fp || decoded.fp !== expectedFingerprint;
      if (mismatch) {
        if (bindingMode === "report") {
          logger.warn("Session fingerprint mismatch (report mode)", {
            path: req.originalUrl,
            userId: String(user?._id || ""),
          });
        } else {
          return res.status(401).json({
            code: ERROR_CODES.SESSION_REVOKED,
            message: "Session fingerprint mismatch",
          });
        }
      }
    }

    req.user = await touchPresenceIfNeeded(user);
    return next();
  } catch (error) {
    logger.error("Optional authorization middleware error", { path: req.originalUrl }, error);
    return res
      .status(500)
      .json({ code: ERROR_CODES.SERVER_ERROR, message: "Authorization error" });
  }
};

export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ code: ERROR_CODES.UNAUTHORIZED, message: "Unauthorized" });
    }

    const normalizedRoles = roles.map((role) => String(role || "").trim().toLowerCase());
    if (!normalizedRoles.includes(String(req.user.role || "").trim().toLowerCase())) {
      return res.status(403).json({ code: ERROR_CODES.FORBIDDEN, message: "Forbidden" });
    }

    return next();
  };

export const requireAdmin = requireRole(...ADMIN_ROLES);
export const requireSuperadmin = requireRole("superadmin");

export const protect = requireAuth;
export const admin = requireAdmin;

export { isAdminRole };
