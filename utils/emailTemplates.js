const BRAND = {
  green: "#10b981",
  dark: "#1f2937",
  grey: "#6b7280",
  soft: "#f3f4f6",
  border: "#e5e7eb",
  white: "#ffffff"
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
    <a href="${dashboardUrl}" style="display:inline-block;background:${BRAND.green};color:${BRAND.white};text-decoration:none;padding:12px 18px;border-radius:8px;font-size:14px;font-weight:700;">
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

