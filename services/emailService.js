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

  const safeName = escapeHtml(customerName);
  const safeProductLine = escapeHtml(productLine);
  const safeProductUrl = escapeHtml(productUrl);
  const safeOriginal = escapeHtml(originalMessage).replace(/\n/g, "<br />");
  const safeAnswer = escapeHtml(answer).replace(/\n/g, "<br />");

  const html = `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Відповідь менеджера на ваше питання щодо товару.</div>
    <div style="margin:0;padding:0;background:#f4efe6;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background:#f4efe6;">
        <tr>
          <td align="center" style="padding:32px 16px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;max-width:620px;background:#fffaf2;border:1px solid #dfd2bf;">
              <tr>
                <td style="padding:28px 30px 18px;background:#2f1d13;color:#fffaf2;">
                  <div style="font-family:Arial,sans-serif;font-size:12px;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:#d5842f;">MebliHub</div>
                  <h1 style="margin:12px 0 0;font-family:Arial,sans-serif;font-size:28px;line-height:34px;font-weight:700;color:#fffaf2;">Відповідь на питання</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:30px;font-family:Arial,sans-serif;color:#2b211b;">
                  <p style="margin:0 0 14px;font-size:16px;line-height:24px;">${safeName},</p>
                  <p style="margin:0 0 18px;font-size:16px;line-height:24px;">Дякуємо за ваше питання. Нижче відповідь менеджера.</p>
                  <p style="margin:0 0 12px;font-size:15px;"><strong>Товар:</strong> ${safeProductLine}</p>
                  ${productUrl ? `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 16px;"><tr><td bgcolor="#c96a00" style="border:1px solid #9f5200;"><a href="${safeProductUrl}" target="_blank" rel="noreferrer" style="display:inline-block;padding:12px 18px;font-family:Arial,sans-serif;font-size:14px;line-height:18px;font-weight:700;color:#ffffff;text-decoration:none;text-transform:uppercase;">Переглянути товар</a></td></tr></table>` : ""}
                  <hr style="border: 0; border-top: 1px solid #dfdcd6; margin: 18px 0;" />
                  <p style="margin:0 0 8px;font-size:14px;line-height:20px;"><strong>Ваше питання:</strong></p>
                  <p style="margin:0 0 14px;font-size:14px;line-height:20px;color:#3a2a1f;">${safeOriginal}</p>
                  <p style="margin:0 0 8px;font-size:14px;line-height:20px;"><strong>Відповідь:</strong></p>
                  <p style="margin:0;font-size:14px;line-height:20px;color:#3a2a1f;">${safeAnswer}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:18px 30px;background:#efe4d4;font-family:Arial,sans-serif;color:#6c5e53;font-size:12px;line-height:18px;">
                  Це автоматичний лист MebliHub. Відповідати на нього не потрібно.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  return {
    to: customerEmail,
    subject,
    text,
    html,
  };
};

export const buildProductQuestionReplySms = ({ question, replyMessage } = {}) => {
  const productTitle = getProductTitle(question);
  const customerPhone = pickStr(question?.customer?.phone);
  const sku = pickStr(question?.productSnapshot?.sku);
  const originalMessage = normalizeMultiline(question?.message)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  const answer = normalizeMultiline(replyMessage || question?.adminReply?.message)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);

  const brand = "MebliHub";
  const header = `[${brand}]`;
  let text = `${header} Відповідь на питання про ${productTitle}${sku ? ` (${sku})` : ""}. `;
  if (originalMessage) text += `Питання: ${originalMessage}. `;
  text += `Відповідь: ${answer}`;

  // Ensure SMS-friendly single-line text
  text = text.replace(/\s+/g, " ").trim();

  return {
    to: customerPhone,
    text,
  };
};

export const sendProductQuestionReplySms = async ({ question, replyMessage } = {}) => {
  const phone = pickStr(question?.customer?.phone);
  if (!phone) return { sent: false, skipped: true, reason: "NO_CUSTOMER_PHONE" };

  // Currently no SMS provider configured in env. Provide a safe no-op result.
  // Integrate a provider (Twilio, Nexmo, etc.) and use env vars to enable real sending.
  return { sent: false, skipped: true, reason: "SMS_NOT_CONFIGURED" };
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

  const subject = "Відновлення пароля MebliHub";
  const text = [
    `${customerName},`,
    "",
    "Ми отримали запит на відновлення пароля до вашого акаунта MebliHub.",
    "Щоб створити новий пароль, відкрийте це посилання:",
    resetUrl,
    "",
    expiresText ? `Посилання активне до: ${expiresText}` : "",
    "",
    "Якщо ви не запитували відновлення пароля, нічого робити не потрібно. Старий пароль залишиться без змін.",
  ]
    .filter(Boolean)
    .join("\n");

  const safeName = escapeHtml(customerName);
  const safeResetUrl = escapeHtml(resetUrl);
  const safeExpiresText = escapeHtml(expiresText);

  const html = `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      Встановіть новий пароль для акаунта MebliHub. Посилання тимчасове.
    </div>
    <div style="margin:0;padding:0;background:#f4efe6;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background:#f4efe6;">
        <tr>
          <td align="center" style="padding:32px 16px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;max-width:620px;background:#fffaf2;border:1px solid #dfd2bf;">
              <tr>
                <td style="padding:28px 30px 18px;background:#2f1d13;color:#fffaf2;">
                  <div style="font-family:Arial,sans-serif;font-size:12px;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:#d5842f;">
                    MebliHub
                  </div>
                  <h1 style="margin:12px 0 0;font-family:Arial,sans-serif;font-size:28px;line-height:34px;font-weight:700;color:#fffaf2;">
                    Відновлення пароля
                  </h1>
                </td>
              </tr>
              <tr>
                <td style="padding:30px;font-family:Arial,sans-serif;color:#2b211b;">
                  <p style="margin:0 0 14px;font-size:16px;line-height:24px;">${safeName},</p>
                  <p style="margin:0 0 22px;font-size:16px;line-height:24px;">
                    Ми отримали запит на відновлення пароля до вашого акаунта. Натисніть кнопку нижче і задайте новий пароль.
                  </p>
                  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px;">
                    <tr>
                      <td bgcolor="#c96a00" style="border:1px solid #9f5200;">
                        <a href="${safeResetUrl}" target="_blank" rel="noreferrer" style="display:inline-block;padding:14px 22px;font-family:Arial,sans-serif;font-size:15px;line-height:18px;font-weight:700;color:#ffffff;text-decoration:none;text-transform:uppercase;">
                          Створити новий пароль
                        </a>
                      </td>
                    </tr>
                  </table>
                  ${
                    safeExpiresText
                      ? `<p style="margin:0 0 18px;font-size:14px;line-height:22px;color:#5f5148;">
                          Посилання активне до <strong style="color:#2b211b;">${safeExpiresText}</strong>.
                        </p>`
                      : ""
                  }
                  <div style="margin:24px 0;padding:16px 18px;background:#f7ead8;border-left:4px solid #c96a00;">
                    <p style="margin:0;font-size:14px;line-height:22px;color:#3a2a1f;">
                      Якщо ви не запитували відновлення пароля, просто не відкривайте це посилання. Старий пароль залишиться без змін.
                    </p>
                  </div>
                  <p style="margin:0 0 8px;font-size:13px;line-height:20px;color:#6c5e53;">
                    Якщо кнопка не відкривається, скопіюйте це посилання в браузер:
                  </p>
                  <p style="margin:0;font-size:13px;line-height:20px;word-break:break-all;">
                    <a href="${safeResetUrl}" target="_blank" rel="noreferrer" style="color:#9f5200;text-decoration:underline;">${safeResetUrl}</a>
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:18px 30px;background:#efe4d4;font-family:Arial,sans-serif;color:#6c5e53;font-size:12px;line-height:18px;">
                  Це автоматичний лист MebliHub. Відповідати на нього не потрібно.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
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
