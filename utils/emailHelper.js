import nodemailer from "nodemailer";

const {
  EMAIL_USER,
  EMAIL_PASS,
  EMAIL_FROM,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS
} = process.env;

const smtpUser = SMTP_USER || EMAIL_USER;
const smtpPass = SMTP_PASS || EMAIL_PASS;
const fromAddress = EMAIL_FROM || `"HabitCoachAI" <${smtpUser || EMAIL_USER}>`;

const transporter = nodemailer.createTransport(
  SMTP_HOST
    ? {
        host: SMTP_HOST,
        port: Number(SMTP_PORT || 587),
        secure: SMTP_SECURE === "true",
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      }
    : {
        service: "gmail",
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      }
);

/**
 * Reusable email sender for system notifications.
 * Returns an object with success/error details so callers can log outcomes.
 */
export const sendEmail = async (to, subject, html) => {
  if (!smtpUser || !smtpPass) {
    const missingConfigError = new Error("Email credentials are missing. Set SMTP_USER/SMTP_PASS or EMAIL_USER/EMAIL_PASS.");
    return { ok: false, error: missingConfigError };
  }

  if (!to || !subject || !html) {
    const invalidPayloadError = new Error("Invalid email payload. 'to', 'subject', and 'html' are required.");
    return { ok: false, error: invalidPayloadError };
  }

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      html
    });

    return { ok: true, messageId: info.messageId };
  } catch (error) {
    return { ok: false, error };
  }
};
