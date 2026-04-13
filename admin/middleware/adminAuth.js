import jwt from "jsonwebtoken";
import { ERROR_CODES } from "../../app/constants/errorCodes.js";
import User, { isAdminRole } from "../../models/userModel.js";

export async function protectAdmin(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    if (!token) {
      return res.status(401).json({ code: ERROR_CODES.UNAUTHORIZED, message: "NO_TOKEN" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({ code: ERROR_CODES.UNAUTHORIZED, message: "USER_NOT_FOUND" });
    }

    const isAdmin = isAdminRole(user.role) || user.isAdmin === true;

    if (!isAdmin) return res.status(403).json({ code: ERROR_CODES.FORBIDDEN, message: "FORBIDDEN" });

    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ code: ERROR_CODES.INVALID_TOKEN, message: "INVALID_TOKEN" });
  }
}
