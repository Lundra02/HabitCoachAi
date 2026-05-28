import 'dotenv/config'; // 1. THIS MUST BE FIRST
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import cron from "node-cron";
import morgan from "morgan";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import authRoute from "./routes/auth.js";
import habitsRoute from "./routes/habits.js";
import chatRoute from "./routes/chat.js";
import progressRoute from "./routes/progress.js";
import reviewsRoute from "./routes/reviews.js";
import settingsRoute from "./routes/settings.js";
import socialRoute from "./routes/social.js";
import errorHandler from "./middleware/errorHandler.js";
import User from "./models/User.js";
import Habit from "./models/Habit.js";
import { sendEmail } from "./utils/emailHelper.js";
import {
  generateMorningEmail,
  generateEveningEmail,
  generateMissedHabitReminderEmail,
  generateWeeklyProgressEmail
} from "./utils/emailTemplates.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const CRON_TIMEZONE = process.env.CRON_TIMEZONE || "UTC";
const DASHBOARD_URL = process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 3000}`;
const WEEKDAY_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

app.use(cors({
  origin: process.env.FRONTEND_URL || "*", 
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
app.use(express.json());
app.use(morgan("combined"));

// If behind a proxy (Heroku, Render, etc.) enable trust proxy so rate-limiter and helmet work as expected
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"]
    }
  }
}));

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // limit each IP to 120 requests per window
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Serve Static Frontend Files from the "public" directory securely
app.use(express.static(path.join(__dirname, "public")));

// API Routes
app.use("/api", authRoute);
app.use("/api/habits", habitsRoute);
app.use("/api/chat", chatRoute);
app.use("/api/progress", progressRoute);
app.use("/api/reviews", reviewsRoute);
app.use("/api/settings", settingsRoute);
app.use("/api/social", socialRoute);

// Global error handler (should be after routes)
app.use(errorHandler);

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const getContextForTimezone = (date, timeZone) => {
  try {
    const dateParts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(date);

    const year = dateParts.find((part) => part.type === "year")?.value || "0000";
    const month = dateParts.find((part) => part.type === "month")?.value || "01";
    const day = dateParts.find((part) => part.type === "day")?.value || "01";
    const hour = Number(dateParts.find((part) => part.type === "hour")?.value || "0");
    const minute = Number(dateParts.find((part) => part.type === "minute")?.value || "0");

    const weekdayShort = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short"
    }).format(date);

    const dateKey = `${year}-${month}-${day}`;
    return {
      dateKey,
      dayIndex: WEEKDAY_INDEX[weekdayShort] ?? 0,
      hour,
      minute
    };
  } catch (e) {
    // Fallback to UTC
    return {
      dateKey: date.toISOString().slice(0, 10),
      dayIndex: date.getUTCDay(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes()
    };
  }
};

const getHabitFrequency = (habit) => {
  if (!Array.isArray(habit.frequency) || habit.frequency.length === 0) {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  const normalizedDays = habit.frequency
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return normalizedDays.length > 0 ? normalizedDays : [0, 1, 2, 3, 4, 5, 6];
};

const getTodayHabitStatus = (habit, todayKey) => {
  const history = Array.isArray(habit.history) ? habit.history : [];
  const todayRecord = history.find((record) => record?.date === todayKey);
  return todayRecord?.status || habit.status || "pending";
};

const toDateFromKey = (key) => new Date(`${key}T00:00:00.000Z`);

const toKeyFromDate = (date) => date.toISOString().slice(0, 10);

const shiftDateKey = (key, deltaDays) => {
  const date = toDateFromKey(key);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return toKeyFromDate(date);
};

const getWeeklyProgressSummary = (habits, todayKey) => {
  const dayStats = new Map();
  for (let i = 0; i < 7; i += 1) {
    dayStats.set(shiftDateKey(todayKey, -i), { completed: 0, missed: 0 });
  }

  for (const habit of habits) {
    const history = Array.isArray(habit.history) ? habit.history : [];
    for (const record of history) {
      if (!dayStats.has(record?.date)) continue;
      const stats = dayStats.get(record.date);
      if (record.status === "completed") stats.completed += 1;
      if (record.status === "missed") stats.missed += 1;
    }
  }

  let completed = 0;
  let missed = 0;
  let bestDay = "";
  let bestDayCompleted = 0;

  for (const [dateKey, stats] of dayStats.entries()) {
    completed += stats.completed;
    missed += stats.missed;
    if (stats.completed > bestDayCompleted) {
      bestDayCompleted = stats.completed;
      bestDay = dateKey;
    }
  }

  const total = completed + missed;
  return {
    completed,
    missed,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    bestDay
  };
};

const runMorningBriefingJob = async () => {
  try {
    const users = await User.find({}, { name: 1, email: 1, timezone: 1, settings: 1 }).lean();

    for (const user of users) {
      if (!user.email) continue;
      if (user.settings?.notifications?.morningBriefing === false) continue;

      const tz = user.timezone || CRON_TIMEZONE;
      const userTime = getContextForTimezone(new Date(), tz);

      if (userTime.hour !== 7) continue;

      try {
        const habits = await Habit.find({ user_id: user._id }).lean();
        const todaysHabits = habits
          .filter((habit) => getHabitFrequency(habit).includes(userTime.dayIndex))
          .map((habit) => ({
            title: escapeHtml(habit.title),
            timeOfDay: escapeHtml(habit.timeOfDay || "Morning")
          }));

        const html = generateMorningEmail({
          habits: todaysHabits,
          dashboardUrl: DASHBOARD_URL
        });

        const emailResult = await sendEmail(user.email, "\u2600\uFE0F Your Daily Habit Plan", html);
        if (!emailResult.ok) {
          console.error(`Morning briefing failed for ${user.email}:`, emailResult.error?.message || emailResult.error);
        } else {
          console.log(`Sent morning briefing to ${user.email} (local time hour: ${userTime.hour}, timezone: ${tz})`);
        }
      } catch (error) {
        console.error(`Morning briefing user processing failed for ${user.email}:`, error.message);
      }
    }
  } catch (error) {
    console.error("Morning briefing job failed:", error.message);
  }
};

const runEveningReportJob = async () => {
  try {
    const users = await User.find({}, { name: 1, email: 1, timezone: 1, settings: 1 }).lean();

    for (const user of users) {
      if (!user.email) continue;
      if (user.settings?.notifications?.eveningReview === false) continue;

      const tz = user.timezone || CRON_TIMEZONE;
      const userTime = getContextForTimezone(new Date(), tz);

      if (userTime.hour !== 23) continue;

      try {
        const habits = await Habit.find({ user_id: user._id }).lean();
        const scheduledToday = habits.filter((habit) => getHabitFrequency(habit).includes(userTime.dayIndex));

        let completed = 0;
        let missed = 0;

        for (const habit of scheduledToday) {
          const status = getTodayHabitStatus(habit, userTime.dateKey);
          if (status === "completed") {
            completed += 1;
          } else {
            // At end of day, pending items are counted as missed for reporting.
            missed += 1;
          }
        }

        const total = completed + missed;
        const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

        const html = generateEveningEmail({ completed, missed, successRate });
        const emailResult = await sendEmail(user.email, "\uD83C\uDF19 Daily Summary", html);

        if (!emailResult.ok) {
          console.error(`Evening report failed for ${user.email}:`, emailResult.error?.message || emailResult.error);
        } else {
          console.log(`Sent evening report to ${user.email} (local time hour: ${userTime.hour}, timezone: ${tz})`);
        }
      } catch (error) {
        console.error(`Evening report user processing failed for ${user.email}:`, error.message);
      }
    }
  } catch (error) {
    console.error("Evening report job failed:", error.message);
  }
};

const runMissedHabitReminderJob = async () => {
  try {
    const users = await User.find({}, { name: 1, email: 1, timezone: 1, settings: 1 }).lean();

    for (const user of users) {
      if (!user.email) continue;
      if (user.settings?.notifications?.missedHabitReminders === false) continue;

      const tz = user.timezone || CRON_TIMEZONE;
      const userTime = getContextForTimezone(new Date(), tz);

      if (userTime.hour !== 17) continue;

      try {
        const habits = await Habit.find({ user_id: user._id }).lean();
        const pendingHabits = habits
          .filter((habit) => getHabitFrequency(habit).includes(userTime.dayIndex))
          .filter((habit) => getTodayHabitStatus(habit, userTime.dateKey) === "pending")
          .map((habit) => ({
            title: escapeHtml(habit.title),
            timeOfDay: escapeHtml(habit.timeOfDay || "Morning")
          }));

        if (pendingHabits.length === 0) continue;

        const html = generateMissedHabitReminderEmail({
          pendingHabits,
          dashboardUrl: DASHBOARD_URL
        });
        const emailResult = await sendEmail(user.email, "Pending habit reminder", html);

        if (!emailResult.ok) {
          console.error(`Missed habit reminder failed for ${user.email}:`, emailResult.error?.message || emailResult.error);
        } else {
          console.log(`Sent missed habit reminder to ${user.email} (local time hour: ${userTime.hour}, timezone: ${tz})`);
        }
      } catch (error) {
        console.error(`Missed habit reminder user processing failed for ${user.email}:`, error.message);
      }
    }
  } catch (error) {
    console.error("Missed habit reminder job failed:", error.message);
  }
};

const runWeeklyProgressReportJob = async () => {
  try {
    const users = await User.find({}, { name: 1, email: 1, timezone: 1, settings: 1 }).lean();

    for (const user of users) {
      if (!user.email) continue;
      if (user.settings?.notifications?.weeklyProgressReport === false) continue;

      const tz = user.timezone || CRON_TIMEZONE;
      const userTime = getContextForTimezone(new Date(), tz);

      if (userTime.dayIndex !== 1 || userTime.hour !== 8) continue;

      try {
        const habits = await Habit.find({ user_id: user._id }).lean();
        const summary = getWeeklyProgressSummary(habits, userTime.dateKey);
        const html = generateWeeklyProgressEmail({
          completed: summary.completed,
          missed: summary.missed,
          completionRate: summary.completionRate,
          bestDay: summary.bestDay,
          dashboardUrl: DASHBOARD_URL
        });
        const emailResult = await sendEmail(user.email, "Your weekly HabitCoach progress report", html);

        if (!emailResult.ok) {
          console.error(`Weekly progress report failed for ${user.email}:`, emailResult.error?.message || emailResult.error);
        } else {
          console.log(`Sent weekly progress report to ${user.email} (local time hour: ${userTime.hour}, timezone: ${tz})`);
        }
      } catch (error) {
        console.error(`Weekly progress report user processing failed for ${user.email}:`, error.message);
      }
    }
  } catch (error) {
    console.error("Weekly progress report job failed:", error.message);
  }
};

const initializeEmailCronJobs = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("Email cron jobs are disabled. Missing EMAIL_USER or EMAIL_PASS in environment.");
    return;
  }

  // Hourly check for morning briefing at 07:00 local time
  cron.schedule("0 * * * *", () => {
    void runMorningBriefingJob();
  });

  // Hourly check for evening report at 23:59 local time
  cron.schedule("59 * * * *", () => {
    void runEveningReportJob();
  });

  // Hourly check for pending habit reminders at 17:00 local time
  cron.schedule("0 * * * *", () => {
    void runMissedHabitReminderJob();
  });

  // Hourly check for weekly reports at Monday 08:00 local time
  cron.schedule("0 * * * *", () => {
    void runWeeklyProgressReportJob();
  });

  console.log(`Email cron jobs initialized and running hourly timezone checks.`);
};

// Fallback Route (Serving Frontend on any unmatched routes)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {});
    console.log("MongoDB connected");

    app.listen(PORT, () => {
      initializeEmailCronJobs();
      console.log(`Server running on port ${PORT}`);
      console.log("Environment Keys Check:", {
        "AI Key": process.env.AI_API_KEY ? "Found" : "MISSING",
        "MongoDB URI": process.env.MONGO_URI ? "Found" : "MISSING",
        "Email User": process.env.EMAIL_USER ? "Found" : "MISSING",
        "Email Pass": process.env.EMAIL_PASS ? "Found" : "MISSING"
      });
    });
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    process.exit(1);
  }
};

void startServer();
