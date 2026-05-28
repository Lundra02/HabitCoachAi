const BRAND = {
  green: "#10b981",
  dark: "#1f2937",
  grey: "#6b7280",
  soft: "#f3f4f6",
  border: "#e5e7eb",
  white: "#ffffff"
};

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const safeAppUrl = (dashboardUrl = "") => {
  const url = new URL(dashboardUrl);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("Email links must use HTTPS in production.");
  }
  return url.toString().replace(/\/$/, "");
};

const generateLayout = ({ preheader, title, intro, body, footer }) => `
<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:${BRAND.soft};font-family:Arial,Helvetica,sans-serif;color:${BRAND.dark};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.soft};padding:20px 10px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${BRAND.white};border:1px solid ${BRAND.border};border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:${BRAND.green};padding:20px 24px;color:${BRAND.white};font-size:24px;font-weight:700;line-height:1.3;">
                ${title}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 10px 24px;font-size:15px;line-height:1.6;color:${BRAND.grey};">
                ${intro}
              </td>
            </tr>
            <tr>
              <td style="padding:6px 24px 18px 24px;">
                ${body}
              </td>
            </tr>
            <tr>
              <td style="padding:14px 24px 22px 24px;border-top:1px solid ${BRAND.border};font-size:12px;color:${BRAND.grey};line-height:1.5;">
                ${footer}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

export const generateMorningEmail = ({ habits, dashboardUrl }) => {
  const safeDashboardUrl = safeAppUrl(dashboardUrl);
  const listMarkup = habits.length
    ? habits
        .map(
          (habit) => `
            <li style="margin:0 0 10px 0;color:${BRAND.dark};font-size:15px;line-height:1.5;">
              <strong>${habit.title}</strong>
              <span style="color:${BRAND.grey};"> (${habit.timeOfDay})</span>
            </li>
          `
        )
        .join("")
    : `<li style="color:${BRAND.grey};font-size:15px;line-height:1.5;">No habits scheduled for today.</li>`;

  const body = `
    <p style="margin:0 0 14px 0;color:${BRAND.dark};font-size:16px;font-weight:600;">Today's habits:</p>
    <ul style="margin:0 0 18px 18px;padding:0;">
      ${listMarkup}
    </ul>
    <a href="${safeDashboardUrl}" style="display:inline-block;background:${BRAND.green};color:${BRAND.white};text-decoration:none;padding:12px 18px;border-radius:8px;font-size:14px;font-weight:700;">
      Go to Dashboard
    </a>
  `;

  return generateLayout({
    preheader: "Your habit plan for today is ready.",
    title: "\u2600\uFE0F Your Daily Habit Plan",
    intro: "Here is your focused plan for today. Stick to your schedule and keep your consistency strong.",
    body,
    footer: "HabitCoachAI automated notification"
  });
};

export const generateEveningEmail = ({ completed, missed, successRate }) => {
  const progressWidth = Math.max(0, Math.min(100, successRate));

  const body = `
    <p style="margin:0 0 14px 0;color:${BRAND.dark};font-size:16px;font-weight:600;">Today's performance</p>
    <div style="width:100%;background:${BRAND.border};border-radius:999px;height:12px;overflow:hidden;margin:0 0 14px 0;">
      <div style="width:${progressWidth}%;height:12px;background:${BRAND.green};"></div>
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 8px;">
      <tr>
        <td style="padding:12px;border:1px solid ${BRAND.border};border-radius:8px;background:${BRAND.soft};font-size:14px;color:${BRAND.dark};">
          Completed: <strong>${completed}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:12px;border:1px solid ${BRAND.border};border-radius:8px;background:${BRAND.soft};font-size:14px;color:${BRAND.dark};">
          Missed: <strong>${missed}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:12px;border:1px solid ${BRAND.border};border-radius:8px;background:${BRAND.soft};font-size:14px;color:${BRAND.dark};">
          Success Rate: <strong>${successRate}%</strong>
        </td>
      </tr>
    </table>
  `;

  return generateLayout({
    preheader: "Your daily habit summary is ready.",
    title: "\uD83C\uDF19 Daily Summary",
    intro: "Your end-of-day progress is available. Review your numbers and prepare for tomorrow.",
    body,
    footer: "HabitCoachAI automated notification"
  });
};

export const generateMissedHabitReminderEmail = ({ pendingHabits, dashboardUrl }) => {
  const safeDashboardUrl = safeAppUrl(dashboardUrl);
  const listMarkup = pendingHabits.length
    ? pendingHabits
        .map(
          (habit) => `
            <li style="margin:0 0 10px 0;color:${BRAND.dark};font-size:15px;line-height:1.5;">
              <strong>${habit.title}</strong>
              <span style="color:${BRAND.grey};"> (${habit.timeOfDay})</span>
            </li>
          `
        )
        .join("")
    : `<li style="color:${BRAND.grey};font-size:15px;line-height:1.5;">No pending habits right now.</li>`;

  const body = `
    <p style="margin:0 0 14px 0;color:${BRAND.dark};font-size:16px;font-weight:600;">Still pending today:</p>
    <ul style="margin:0 0 18px 18px;padding:0;">
      ${listMarkup}
    </ul>
    <a href="${safeDashboardUrl}" style="display:inline-block;background:${BRAND.green};color:${BRAND.white};text-decoration:none;padding:12px 18px;border-radius:8px;font-size:14px;font-weight:700;">
      Finish Today's Habits
    </a>
  `;

  return generateLayout({
    preheader: "You still have habits waiting today.",
    title: "Pending Habit Reminder",
    intro: "A small finish today keeps your streak easier tomorrow.",
    body,
    footer: "HabitCoachAI automated notification"
  });
};

export const generateWeeklyProgressEmail = ({ completed, missed, completionRate, bestDay, dashboardUrl }) => {
  const safeDashboardUrl = safeAppUrl(dashboardUrl);
  const progressWidth = Math.max(0, Math.min(100, completionRate));
  const body = `
    <p style="margin:0 0 14px 0;color:${BRAND.dark};font-size:16px;font-weight:600;">Last 7 days</p>
    <div style="width:100%;background:${BRAND.border};border-radius:999px;height:12px;overflow:hidden;margin:0 0 14px 0;">
      <div style="width:${progressWidth}%;height:12px;background:${BRAND.green};"></div>
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 8px;">
      <tr>
        <td style="padding:12px;border:1px solid ${BRAND.border};border-radius:8px;background:${BRAND.soft};font-size:14px;color:${BRAND.dark};">
          Completed: <strong>${completed}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:12px;border:1px solid ${BRAND.border};border-radius:8px;background:${BRAND.soft};font-size:14px;color:${BRAND.dark};">
          Missed: <strong>${missed}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:12px;border:1px solid ${BRAND.border};border-radius:8px;background:${BRAND.soft};font-size:14px;color:${BRAND.dark};">
          Completion Rate: <strong>${completionRate}%</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:12px;border:1px solid ${BRAND.border};border-radius:8px;background:${BRAND.soft};font-size:14px;color:${BRAND.dark};">
          Best Day: <strong>${bestDay || "No completed habits yet"}</strong>
        </td>
      </tr>
    </table>
    <a href="${safeDashboardUrl}" style="display:inline-block;margin-top:10px;background:${BRAND.green};color:${BRAND.white};text-decoration:none;padding:12px 18px;border-radius:8px;font-size:14px;font-weight:700;">
      Review Progress
    </a>
  `;

  return generateLayout({
    preheader: "Your weekly habit progress report is ready.",
    title: "Weekly Progress Report",
    intro: "Here is your consistency snapshot from the last 7 days.",
    body,
    footer: "HabitCoachAI automated notification"
  });
};

export const generateVerificationEmail = ({ name, code, expiresMinutes = 10, dashboardUrl }) => {
  const verifyUrl = `${safeAppUrl(dashboardUrl)}/verify.html`;
  const body = `
    <p style="margin:0 0 14px 0;color:${BRAND.dark};font-size:16px;">Hi ${escapeHtml(name || "there")},</p>
    <p style="margin:0 0 14px 0;color:${BRAND.grey};font-size:14px;">
      Use this verification code to confirm your email address. It expires in ${expiresMinutes} minutes.
    </p>
    <div style="margin:18px 0;padding:18px 20px;border:1px solid ${BRAND.border};border-radius:12px;background:${BRAND.soft};text-align:center;">
      <div style="font-size:34px;letter-spacing:8px;font-weight:800;color:${BRAND.dark};font-family:Arial,Helvetica,sans-serif;">${code}</div>
      <div style="margin-top:8px;color:${BRAND.grey};font-size:12px;">Verification code</div>
    </div>
    <a href="${verifyUrl}" style="display:inline-block;background:${BRAND.green};color:${BRAND.white};text-decoration:none;padding:12px 18px;border-radius:8px;font-size:14px;font-weight:700;">Enter code</a>
  `;

  return generateLayout({
    preheader: "Verify your HabitCoach account.",
    title: "Your Verification Code",
    intro: "Confirm your email to unlock the full HabitCoachAI experience.",
    body,
    footer: "If you didn't create an account, you can ignore this email. Never share this code with anyone."
  });
};

export const generateResetEmail = ({ name, token, dashboardUrl }) => {
  const resetUrl = `${safeAppUrl(dashboardUrl)}/reset-password.html#token=${encodeURIComponent(token)}`;
  const body = `
    <p style="margin:0 0 14px 0;color:${BRAND.dark};font-size:16px;">Hi ${escapeHtml(name || "there")},</p>
    <p style="margin:0 0 14px 0;color:${BRAND.grey};font-size:14px;">We received a request to reset your HabitCoach password. Click the button below to set a new password. The link will expire in 1 hour.</p>
    <a href="${resetUrl}" style="display:inline-block;background:${BRAND.green};color:${BRAND.white};text-decoration:none;padding:12px 18px;border-radius:8px;font-size:14px;font-weight:700;">Reset my password</a>
  `;

  return generateLayout({
    preheader: "Reset your HabitCoach password.",
    title: "Reset Password",
    intro: "Use the link below to reset your password.",
    body,
    footer: "If you didn't request a password reset, you can ignore this email."
  });
};

export const generateDuoInviteEmail = ({ inviterName, habitTitle, dashboardUrl }) => {
  const safeDashboardUrl = safeAppUrl(dashboardUrl);
  const body = `
    <p style="margin:0 0 14px 0;color:${BRAND.dark};font-size:16px;">Hi there,</p>
    <p style="margin:0 0 14px 0;color:${BRAND.grey};font-size:14px;">
      <strong>${escapeHtml(inviterName || "A HabitCoachAI user")}</strong> invited you to build the habit
      <strong>${escapeHtml(habitTitle || "Untitled Habit")}</strong> together.
    </p>
    <a href="${safeDashboardUrl}" style="display:inline-block;background:${BRAND.green};color:${BRAND.white};text-decoration:none;padding:12px 18px;border-radius:8px;font-size:14px;font-weight:700;">
      Open Pending Invitations
    </a>
  `;

  return generateLayout({
    preheader: "You have a new Duo habit invitation.",
    title: "New Duo Invitation",
    intro: "A friend wants to build consistency with you.",
    body,
    footer: "Open HabitCoachAI and go to Duos & Social to accept or deny this invitation."
  });
};
