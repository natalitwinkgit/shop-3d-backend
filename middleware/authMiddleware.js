import jwt from "jsonwebtoken";
import User, { ADMIN_ROLES, isAdminRole } from "../models/userModel.js";

const getTokenFromReq = (req) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) return auth.split(" ")[1];

  const cookieToken = req.cookies?.token || req.cookies?.jwt || null;
  if (cookieToken) return cookieToken;

  return null;
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
    const token = getTokenFromReq(req);
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "JWT_SECRET is not configured" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (error?.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expired" });
      }
      return res.status(401).json({ message: "Invalid token" });
    }

    const user = await User.findById(decoded.id).select("-passwordHash -password");
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (user.status === "banned") {
      return res.status(403).json({ message: "User is banned" });
    }

    req.user = await touchPresenceIfNeeded(user);
    return next();
  } catch (error) {
    console.error("[AUTH]", error);
    return res.status(500).json({ message: "Authorization error" });
  }
};

export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const normalizedRoles = roles.map((role) => String(role || "").trim().toLowerCase());
    if (!normalizedRoles.includes(String(req.user.role || "").trim().toLowerCase())) {
      return res.status(403).json({ message: "Forbidden" });
    }

    return next();
  };

export const requireAdmin = requireRole(...ADMIN_ROLES);
export const requireSuperadmin = requireRole("superadmin");

export const protect = requireAuth;
export const admin = requireAdmin;

export { isAdminRole };
