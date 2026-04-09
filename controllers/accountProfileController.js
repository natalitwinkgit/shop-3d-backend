import User from "../models/userModel.js";
import { buildPublicUserResponse, getAdminUserDetail } from "../services/userProfileService.js";
import {
  getUploadedAvatarPath,
  normalizeAddresses,
  removeUploadByPublicPath,
} from "../services/accountProfileService.js";
import { assertActorCanManageUserProfile } from "../admin/lib/adminShared.js";

const getCurrentUserId = (req) => req.user?._id || req.user?.id || null;

const loadUserById = async (userId) => {
  if (!userId) return null;
  return User.findById(userId).select("-passwordHash -password");
};

const buildAvatarResponse = (userDoc) => ({
  user: buildPublicUserResponse(userDoc),
});

export const updateMyAvatar = async (req, res) => {
  try {
    const user = await loadUserById(getCurrentUserId(req));
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const avatarPath = getUploadedAvatarPath(req);
    if (!avatarPath) {
      return res.status(400).json({ message: "Avatar image is required" });
    }

    const previousAvatar = user.avatar;
    user.avatar = avatarPath;
    user.avatarUpdatedAt = new Date();
    await user.save();

    if (previousAvatar && previousAvatar !== avatarPath) {
      removeUploadByPublicPath(previousAvatar);
    }

    return res.json(buildAvatarResponse(user));
  } catch (error) {
    console.error("[PROFILE avatar PATCH]", error);
    return res.status(error.statusCode || 500).json({ message: error.message || "Avatar update failed" });
  }
};

export const deleteMyAvatar = async (req, res) => {
  try {
    const user = await loadUserById(getCurrentUserId(req));
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const previousAvatar = user.avatar;
    user.avatar = "";
    user.avatarUpdatedAt = null;
    await user.save();

    if (previousAvatar) {
      removeUploadByPublicPath(previousAvatar);
    }

    return res.json(buildAvatarResponse(user));
  } catch (error) {
    console.error("[PROFILE avatar DELETE]", error);
    return res.status(error.statusCode || 500).json({ message: error.message || "Avatar delete failed" });
  }
};

export const getMyAddresses = async (req, res) => {
  try {
    const user = await loadUserById(getCurrentUserId(req));
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    return res.json({ addresses: normalizeAddresses(user.addresses || []) });
  } catch (error) {
    console.error("[PROFILE addresses GET]", error);
    return res.status(500).json({ message: "Addresses load failed" });
  }
};

export const setMyAddresses = async (req, res) => {
  try {
    const user = await loadUserById(getCurrentUserId(req));
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    user.addresses = normalizeAddresses(req.body?.addresses);
    await user.save();

    return res.json({ addresses: normalizeAddresses(user.addresses || []) });
  } catch (error) {
    console.error("[PROFILE addresses PUT]", error);
    return res.status(error.statusCode || 500).json({ message: error.message || "Addresses update failed" });
  }
};

export const updateAdminUserAvatar = async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id).select("-passwordHash -password");
    if (!targetUser) return res.status(404).json({ message: "User not found" });

    assertActorCanManageUserProfile(req.user, targetUser);

    const avatarPath = getUploadedAvatarPath(req);
    if (!avatarPath) {
      return res.status(400).json({ message: "Avatar image is required" });
    }

    const previousAvatar = targetUser.avatar;
    targetUser.avatar = avatarPath;
    targetUser.avatarUpdatedAt = new Date();
    targetUser.updatedBy = getCurrentUserId(req);
    await targetUser.save();

    if (previousAvatar && previousAvatar !== avatarPath) {
      removeUploadByPublicPath(previousAvatar);
    }

    const detail = await getAdminUserDetail(targetUser._id);
    return res.json({ user: detail.user });
  } catch (error) {
    console.error("[ADMIN user avatar PATCH]", error);
    return res.status(error.statusCode || 500).json({ message: error.message || "Avatar update failed" });
  }
};

export const deleteAdminUserAvatar = async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id).select("-passwordHash -password");
    if (!targetUser) return res.status(404).json({ message: "User not found" });

    assertActorCanManageUserProfile(req.user, targetUser);

    const previousAvatar = targetUser.avatar;
    targetUser.avatar = "";
    targetUser.avatarUpdatedAt = null;
    targetUser.updatedBy = getCurrentUserId(req);
    await targetUser.save();

    if (previousAvatar) {
      removeUploadByPublicPath(previousAvatar);
    }

    const detail = await getAdminUserDetail(targetUser._id);
    return res.json({ user: detail.user });
  } catch (error) {
    console.error("[ADMIN user avatar DELETE]", error);
    return res.status(error.statusCode || 500).json({ message: error.message || "Avatar delete failed" });
  }
};
