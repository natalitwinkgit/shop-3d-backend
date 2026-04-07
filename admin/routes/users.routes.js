import { Router } from "express";

import { requireSuperadmin } from "../../middleware/authMiddleware.js";
import User, {
  USER_ROLES,
  USER_STATUSES,
  isValidPhone,
  normalizePhone,
} from "../../models/userModel.js";
import {
  buildPublicUserResponse,
  createUserReward,
  getAdminUserDetail,
  listAdminUserOrders,
  listAdminUsersData,
  normalizeUserRole,
  normalizeUserStatus,
  splitUserName,
  syncUserCommerceData,
  updateUserLoyaltySettings,
  updateUserReward,
} from "../../services/userProfileService.js";
import {
  assertActorCanManageUserProfile,
  ensureEmailIsUnique,
  ensurePhoneIsUnique,
  hashPassword,
} from "../lib/adminShared.js";

const router = Router();

const createAdminUserHandler = async (req, res) => {
  try {
    const firstName = String(req.body?.firstName || "").trim();
    const lastName = String(req.body?.lastName || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const phone = normalizePhone(req.body?.phone);
    const password = String(req.body?.password || "");
    const role = normalizeUserRole(req.body?.role, "user");
    const status = normalizeUserStatus(req.body?.status, "active");
    const city = String(req.body?.city || "").trim();

    if (!firstName || !email || !phone || !password) {
      return res.status(400).json({
        message: "firstName, email, phone and password are required",
      });
    }

    if (!USER_ROLES.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    if (!USER_STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    if (!isValidPhone(phone)) {
      return res.status(400).json({ message: "Invalid phone number" });
    }

    await ensureEmailIsUnique({ email });
    const phoneNormalized = await ensurePhoneIsUnique({ phone });
    const name = `${firstName} ${String(lastName || "").trim()}`.trim();
    const passwordHash = await hashPassword(password);

    const user = await User.create({
      name,
      email,
      phone,
      phoneNormalized,
      passwordHash,
      role,
      status,
      city,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });

    const synced = await syncUserCommerceData(user._id);
    return res.status(201).json(synced || buildPublicUserResponse(user));
  } catch (error) {
    console.error("[ADMIN users POST]", error);
    return res.status(error.statusCode || 400).json({
      message: error.message || "Create user failed",
    });
  }
};

const patchAdminUserProfileHandler = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    assertActorCanManageUserProfile(req.user, user);

    if (req.body?.role !== undefined || req.body?.status !== undefined) {
      return res.status(400).json({
        message: "Use dedicated role/status endpoints",
      });
    }

    const firstNameProvided = req.body?.firstName !== undefined;
    const lastNameProvided = req.body?.lastName !== undefined;
    if (firstNameProvided || lastNameProvided) {
      const currentParts = splitUserName(user.name);
      const firstName = firstNameProvided
        ? String(req.body?.firstName || "").trim()
        : currentParts.firstName;
      const lastName = lastNameProvided
        ? String(req.body?.lastName || "").trim()
        : currentParts.lastName;
      user.name = `${firstName} ${lastName}`.trim();
    }

    if (req.body?.email !== undefined) {
      const email = String(req.body.email || "").trim().toLowerCase();
      if (!email) {
        return res.status(400).json({ message: "Email cannot be empty" });
      }
      await ensureEmailIsUnique({ email, excludeUserId: user._id });
      user.email = email;
    }

    if (req.body?.phone !== undefined) {
      const phone = normalizePhone(req.body.phone);
      if (!isValidPhone(phone)) {
        return res.status(400).json({ message: "Invalid phone number" });
      }
      const phoneNormalized = await ensurePhoneIsUnique({
        phone,
        excludeUserId: user._id,
      });
      user.phone = phone;
      user.phoneNormalized = phoneNormalized;
    }

    if (req.body?.city !== undefined) {
      user.city = String(req.body.city || "").trim();
    }

    if (typeof req.body?.password === "string" && req.body.password.trim()) {
      user.passwordHash = await hashPassword(req.body.password.trim());
    }

    user.updatedBy = req.user?._id || null;
    await user.save();

    const synced = await syncUserCommerceData(user._id);
    return res.json(synced || buildPublicUserResponse(user));
  } catch (error) {
    console.error("[ADMIN users PATCH]", error);
    return res.status(error.statusCode || 400).json({
      message: error.message || "Update user failed",
    });
  }
};

router.get("/users", async (_req, res) => {
  try {
    const users = await listAdminUsersData();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Failed to load users" });
  }
});

router.post("/users", requireSuperadmin, createAdminUserHandler);

router.get("/users/:id", async (req, res) => {
  try {
    const detail = await getAdminUserDetail(req.params.id);
    res.json(detail);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message || "Failed to load user detail",
    });
  }
});

router.get("/users/:id/orders", async (req, res) => {
  try {
    const result = await listAdminUserOrders(req.params.id, {
      page: req.query.page,
      limit: req.query.limit,
      status: req.query.status,
    });
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message || "Failed to load user orders",
    });
  }
});

router.patch("/users/:id/loyalty", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    assertActorCanManageUserProfile(req.user, user);

    await updateUserLoyaltySettings(req.params.id, req.body || {});
    const detail = await getAdminUserDetail(req.params.id);
    res.json(detail.user);
  } catch (error) {
    res.status(error.statusCode || 400).json({
      message: error.message || "Failed to update loyalty",
    });
  }
});

router.post("/users/:id/rewards", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    assertActorCanManageUserProfile(req.user, user);

    const rewards = await createUserReward(req.params.id, req.body || {});
    res.status(201).json({ rewards });
  } catch (error) {
    res.status(error.statusCode || 400).json({
      message: error.message || "Failed to create reward",
    });
  }
});

router.patch("/users/:id/rewards/:rewardId", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    assertActorCanManageUserProfile(req.user, user);

    const rewards = await updateUserReward(req.params.id, req.params.rewardId, req.body || {});
    res.json({ rewards });
  } catch (error) {
    res.status(error.statusCode || 400).json({
      message: error.message || "Failed to update reward",
    });
  }
});

router.patch("/users/:id", patchAdminUserProfileHandler);
router.put("/users/:id", patchAdminUserProfileHandler);

router.patch("/users/:id/role", requireSuperadmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const role = normalizeUserRole(req.body?.role, "");
    if (!role) {
      return res.status(400).json({ message: "role is required" });
    }

    if (!USER_ROLES.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    user.role = role;
    user.updatedBy = req.user?._id || null;
    await user.save();

    const detail = await getAdminUserDetail(user._id);
    return res.json(detail.user);
  } catch (error) {
    console.error("[ADMIN users role PATCH]", error);
    return res.status(error.statusCode || 400).json({
      message: error.message || "Failed to update role",
    });
  }
});

router.patch("/users/:id/status", requireSuperadmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const status = normalizeUserStatus(req.body?.status, "");
    if (!status) {
      return res.status(400).json({ message: "status is required" });
    }

    if (!USER_STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    user.status = status;
    user.updatedBy = req.user?._id || null;
    await user.save();

    const detail = await getAdminUserDetail(user._id);
    return res.json(detail.user);
  } catch (error) {
    console.error("[ADMIN users status PATCH]", error);
    return res.status(error.statusCode || 400).json({
      message: error.message || "Failed to update status",
    });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    assertActorCanManageUserProfile(req.user, user);

    await user.deleteOne();
    res.json({ ok: true });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message || "Delete user failed",
    });
  }
});

export default router;
