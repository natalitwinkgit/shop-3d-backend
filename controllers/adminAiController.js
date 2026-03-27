import { getAiAdminStatus, runAiAdminReply } from "../services/aiAdminService.js";

const resolveChatUserId = (body) =>
  String(
    body?.chatUserId ??
      body?.externalUserId ??
      body?.userId ??
      body?.receiver ??
      body?.targetId ??
      ""
  ).trim();

const getCurrentAdminContext = (req) => ({
  id: String(req.user?._id || req.user?.id || ""),
  name: req.user?.name || "",
  email: req.user?.email || "",
});

const getErrorStatus = (error) =>
  Number(error?.statusCode || error?.status || error?.cause?.status || 500);

const getErrorMessage = (error, fallback) =>
  error?.error?.message ||
  error?.response?.data?.error?.message ||
  error?.response?.data?.message ||
  error?.message ||
  fallback;

export const getAdminAiStatus = async (req, res) => {
  try {
    const status = await getAiAdminStatus();
    res.json(status);
  } catch (error) {
    console.error("[ADMIN AI status]", error);
    res.status(getErrorStatus(error)).json({
      message: getErrorMessage(error, "Failed to load AI status"),
    });
  }
};

export const suggestAdminAiReply = async (req, res) => {
  try {
    const chatUserId = resolveChatUserId(req.body);
    if (!chatUserId) {
      return res.status(400).json({ message: "chatUserId is required" });
    }

    const result = await runAiAdminReply({
      chatUserId,
      currentAdmin: getCurrentAdminContext(req),
      additionalInstructions: req.body?.instructions || "",
      send: false,
      historyLimit: req.body?.historyLimit,
    });

    res.json(result);
  } catch (error) {
    console.error("[ADMIN AI suggest]", error);
    res.status(getErrorStatus(error)).json({
      message: getErrorMessage(error, "Failed to generate AI draft"),
    });
  }
};

export const sendAdminAiReply = async (req, res) => {
  try {
    const chatUserId = resolveChatUserId(req.body);
    if (!chatUserId) {
      return res.status(400).json({ message: "chatUserId is required" });
    }

    const result = await runAiAdminReply({
      chatUserId,
      currentAdmin: getCurrentAdminContext(req),
      additionalInstructions: req.body?.instructions || "",
      send: true,
      historyLimit: req.body?.historyLimit,
    });

    res.json(result);
  } catch (error) {
    console.error("[ADMIN AI reply]", error);
    res.status(getErrorStatus(error)).json({
      message: getErrorMessage(error, "Failed to send AI reply"),
    });
  }
};
