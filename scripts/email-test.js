import "dotenv/config";
import { sendEmail } from "../utils/emailHelper.js";
import {
  generateVerificationEmail,
  generateResetEmail,
  generateMorningEmail,
  generateEveningEmail,
  generateMissedHabitReminderEmail,
  generateWeeklyProgressEmail,
  generateDuoInviteEmail
} from "../utils/emailTemplates.js";

const recipient = process.argv[2] || process.env.EMAIL_TEST_TO;
const dashboardUrl = process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 3000}`;

if (!recipient) {
  console.error("Usage: npm run email:test -- your@email.com");
  process.exit(1);
}

const messages = [
  [
    "Verify your HabitCoach account",
    generateVerificationEmail({
      name: "Demo User",
      token: "demo-verification-token",
      dashboardUrl
    })
  ],
  [
    "Reset your HabitCoach password",
    generateResetEmail({
      name: "Demo User",
      token: "demo-reset-token",
      dashboardUrl
    })
  ],
  [
    "Your Daily Habit Plan",
    generateMorningEmail({
      dashboardUrl,
      habits: [
        { title: "Read 20 minutes", timeOfDay: "Morning" },
        { title: "Workout", timeOfDay: "Afternoon" }
      ]
    })
  ],
  [
    "Daily Summary",
    generateEveningEmail({
      completed: 3,
      missed: 1,
      successRate: 75
    })
  ],
  [
    "Pending habit reminder",
    generateMissedHabitReminderEmail({
      dashboardUrl,
      pendingHabits: [
        { title: "Drink water", timeOfDay: "Afternoon" },
        { title: "Review notes", timeOfDay: "Evening" }
      ]
    })
  ],
  [
    "Your weekly HabitCoach progress report",
    generateWeeklyProgressEmail({
      dashboardUrl,
      completed: 18,
      missed: 4,
      completionRate: 82,
      bestDay: "2026-05-22"
    })
  ],
  [
    "Demo invited you to a Duo habit",
    generateDuoInviteEmail({
      inviterName: "Demo User",
      habitTitle: "Morning run",
      dashboardUrl
    })
  ]
];

console.log(`Sending ${messages.length} test emails to ${recipient}...`);

for (const [subject, html] of messages) {
  const result = await sendEmail(recipient, `[HabitCoachAI Test] ${subject}`, html);
  if (!result.ok) {
    console.error(`${subject}: failed - ${result.error?.message || result.error}`);
    process.exitCode = 1;
  } else {
    console.log(`${subject}: sent`);
  }
}
