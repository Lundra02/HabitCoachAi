import nodemailer from "nodemailer";

const { EMAIL_USER, EMAIL_PASS } = process.env;

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS
  }
});

/**
 * Reusable email sender for system notifications.
 * Returns an object with success/error details so callers can log outcomes.
 */
export const sendEmail = async (to, subject, html) => {
  if (!EMAIL_USER || !EMAIL_PASS) {
    const missingConfigError = new Error("Email credentials are missing. Set EMAIL_USER and EMAIL_PASS.");
    return { ok: false, error: missingConfigError };
  }

  if (!to || !subject || !html) {
    const invalidPayloadError = new Error("Invalid email payload. 'to', 'subject', and 'html' are required.");
    return { ok: false, error: invalidPayloadError };
  }

  try {
    const info = await transporter.sendMail({
      from: `"HabitCoachAI" <${EMAIL_USER}>`,
      to,
      subject,
      html
    });

    return { ok: true, messageId: info.messageId };
  } catch (error) {
    return { ok: false, error };
  }
};

