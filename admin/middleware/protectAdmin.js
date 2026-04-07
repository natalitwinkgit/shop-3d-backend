import { isAdminRole } from "../../models/userModel.js";

export function protectAdmin(req, res, next) {
  const u = req.user;

  const ok =
    !!u &&
    (isAdminRole(u.role) ||
      u.isAdmin === true ||
      u.is_admin === true);

  if (!ok) {
    return res.status(403).json({ message: "ADMIN_ONLY" });
  }

  next();
}
