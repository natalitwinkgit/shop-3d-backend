import { isAdminRole } from "../models/userModel.js";

export const protectAdmin = (req, res, next) => {
  const user = req.user;

  if (user && isAdminRole(user.role)) {
    next();
  } else {
    res.status(403).json({ message: "Not authorized as admin (Access Denied)" });
  }
};
