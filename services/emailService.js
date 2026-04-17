import { logger } from "../app/lib/logger.js";
import { env } from "../config/env.js";

const pickStr = (value) => String(value ?? "").trim();

const escapeHtml = (value) =>
  pickStr(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizeMultiline = (value) =>
  pickStr(value)
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

const getProductTitle = (question = {}) =>
  pickStr(question.productSnapshot?.name?.ua) ||
  pickStr(question.productSnapshot?.name?.en) ||
  pickStr(question.productSnapshot?.sku) ||
  "товару";

const trimTrailingSlash = (value) => String(value || "").replace(/\/+$/, "");

const getClientBaseUrl = () => {
  const explicitResetUrl = pickStr(env.passwordResetUrl);
  if (explicitResetUrl) return "";

  const explicitStoreUrl = trimTrailingSlash(env.publicStoreUrl);
  if (explicitStoreUrl) return explicitStoreUrl;

  const clientUrl = String(env.clientUrl || "")
    .split(",")
    .map((item) => item.trim())
    .find(Boolean);

  return trimTrailingSlash(clientUrl);
};

const buildPasswordResetUrl = (token) => {
  const safeToken = encodeURIComponent(pickStr(token));
  const explicitResetUrl = pickStr(env.passwordResetUrl);
  if (explicitResetUrl) {
    const separator = explicitResetUrl.includes("?") ? "&" : "?";
    return `${explicitResetUrl}${separator}token=${safeToken}`;
  }

  const baseUrl = getClientBaseUrl();
  if (!baseUrl) return `/reset-password?token=${safeToken}`;

  return `${baseUrl}/reset-password?token=${safeToken}`;
};

const getSmtpConfig = () => {
  const host = pickStr(env.smtp.host);
  const port = Number(env.smtp.port || 0);
  const user = pickStr(env.smtp.user);
  const pass = pickStr(env.smtp.pass);
  const from = pickStr(env.smtp.from) || user;

  return {
    host,
    port,
    user,
    pass,
    from,
    secure: env.smtp.secure,
  };
};

export const isSmtpConfigured = () => {
  const config = getSmtpConfig();
  return Boolean(config.host && config.port && config.user && config.pass && config.from);
};

export const buildProductQuestionReplyEmail = ({ question, replyMessage }) => {
  const productTitle = getProductTitle(question);
  const customerName = pickStr(question?.customer?.name) || "Вітаємо";
  const customerEmail = pickStr(question?.customer?.email);
  const productUrl = pickStr(question?.productSnapshot?.pageUrl);
  const sku = pickStr(question?.productSnapshot?.sku);
  const originalMessage = normalizeMultiline(question?.message);
  const answer = normalizeMultiline(replyMessage || question?.adminReply?.message);

  const subject = `Відповідь на питання про ${productTitle}`;
  const productLine = [productTitle, sku ? `SKU: ${sku}` : ""].filter(Boolean).join(" | ");
  const text = [
    `${customerName},`,
    "",
    "Дякуємо за ваше питання. Нижче відповідь менеджера.",
    "",
    `Товар: ${productLine}`,
    productUrl ? `Сторінка товару: ${productUrl}` : "",
    "",
    "Ваше питання:",
    originalMessage,
    "",
    "Відповідь:",
    answer,
  ]
    .filter((line, index, lines) => line || lines[index - 1] !== "")
    .join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f2933;">
      <p>${escapeHtml(customerName)},</p>
      <p>Дякуємо за ваше питання. Нижче відповідь менеджера.</p>
      <p><strong>Товар:</strong> ${escapeHtml(productLine)}</p>
      ${
        productUrl
          ? `<p><a href="${escapeHtml(productUrl)}" target="_blank" rel="noreferrer">Переглянути товар</a></p>`
          : ""
      }
      <hr style="border: 0; border-top: 1px solid #e5e7eb;" />
      <p><strong>Ваше питання:</strong></p>
      <p>${escapeHtml(originalMessage).replace(/\n/g, "<br />")}</p>
      <p><strong>Відповідь:</strong></p>
      <p>${escapeHtml(answer).replace(/\n/g, "<br />")}</p>
    </div>
  `;

  return {
    to: customerEmail,
    subject,
    text,
    html,
  };
};

export const buildPasswordResetEmail = ({ user, token, expiresAt }) => {
  const resetUrl = buildPasswordResetUrl(token);
  const customerName = pickStr(user?.name) || pickStr(user?.email) || "Вітаємо";
  const expiresText = expiresAt
    ? new Intl.DateTimeFormat("uk-UA", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(expiresAt))
    : "";

  const subject = "Відновлення пароля";
  const text = [
    `${customerName},`,
    "",
    "Ви запросили відновлення пароля.",
    `Перейдіть за посиланням і введіть новий пароль: ${resetUrl}`,
    expiresText ? `Посилання діє до: ${expiresText}` : "",
    "",
    "Якщо ви не запитували відновлення пароля, просто проігноруйте цей лист.",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f2933;">
      <p>${escapeHtml(customerName)},</p>
      <p>Ви запросили відновлення пароля.</p>
      <p>
        <a href="${escapeHtml(resetUrl)}" target="_blank" rel="noreferrer">
          Встановити новий пароль
        </a>
      </p>
      ${expiresText ? `<p>Посилання діє до: ${escapeHtml(expiresText)}</p>` : ""}
      <p>Якщо ви не запитували відновлення пароля, просто проігноруйте цей лист.</p>
    </div>
  `;

  return {
    to: pickStr(user?.email),
    subject,
    text,
    html,
    resetUrl,
  };
};

let transporterPromise = null;

const getTransporter = async () => {
  if (!isSmtpConfigured()) return null;
  if (transporterPromise) return transporterPromise;

  transporterPromise = import("nodemailer").then((module) => {
    const nodemailer = module.default || module;
    const config = getSmtpConfig();
    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure ?? config.port === 465,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });
  });

  return transporterPromise;
};

export const sendProductQuestionReplyEmail = async ({ question, replyMessage } = {}) => {
  const customerEmail = pickStr(question?.customer?.email);
  if (!customerEmail) {
    return { sent: false, skipped: true, reason: "NO_CUSTOMER_EMAIL" };
  }

  if (!isSmtpConfigured()) {
    return { sent: false, skipped: true, reason: "SMTP_NOT_CONFIGURED" };
  }

  try {
    const transporter = await getTransporter();
    if (!transporter) {
      return { sent: false, skipped: true, reason: "SMTP_NOT_CONFIGURED" };
    }

    const config = getSmtpConfig();
    const email = buildProductQuestionReplyEmail({ question, replyMessage });
    const info = await transporter.sendMail({
      from: config.from,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });

    return {
      sent: true,
      skipped: false,
      messageId: pickStr(info?.messageId),
    };
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") {
      transporterPromise = null;
    }
    logger.warn("Product question reply email failed", {}, error);
    return {
      sent: false,
      skipped: false,
      reason: "EMAIL_SEND_FAILED",
      error: error?.message || "Email send failed",
    };
  }
};

export const sendPasswordResetEmail = async ({ user, token, expiresAt } = {}) => {
  const customerEmail = pickStr(user?.email);
  if (!customerEmail) {
    return { sent: false, skipped: true, reason: "NO_USER_EMAIL" };
  }

  if (!isSmtpConfigured()) {
    return { sent: false, skipped: true, reason: "SMTP_NOT_CONFIGURED" };
  }

  try {
    const transporter = await getTransporter();
    if (!transporter) {
      return { sent: false, skipped: true, reason: "SMTP_NOT_CONFIGURED" };
    }

    const config = getSmtpConfig();
    const email = buildPasswordResetEmail({ user, token, expiresAt });
    const info = await transporter.sendMail({
      from: config.from,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });

    return {
      sent: true,
      skipped: false,
      messageId: pickStr(info?.messageId),
    };
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") {
      transporterPromise = null;
    }
    logger.warn("Password reset email failed", {}, error);
    return {
      sent: false,
      skipped: false,
      reason: "EMAIL_SEND_FAILED",
      error: error?.message || "Email send failed",
    };
  }
};
