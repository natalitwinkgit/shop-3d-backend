import { isAdminRole } from "../models/userModel.js";
import { loadAdminIndex } from "./adminChatService.js";

const pickId = (value) => String(value || "").trim();

const getCurrentUserId = (user) => pickId(user?._id || user?.id);

export const canAccessSupportConversation = async ({
  currentUser,
  firstId,
  secondId,
}) => {
  const currentUserId = getCurrentUserId(currentUser);
  const id1 = pickId(firstId);
  const id2 = pickId(secondId);

  if (!currentUserId || !id1 || !id2) return false;
  if (isAdminRole(currentUser?.role)) return true;
  if (currentUserId !== id1 && currentUserId !== id2) return false;

  const { adminSet } = await loadAdminIndex();
  return adminSet.has(id1) || adminSet.has(id2);
};
