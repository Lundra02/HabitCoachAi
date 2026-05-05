import 'dotenv/config'; // 1. THIS MUST BE FIRST
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import cron from "node-cron";

import authRoute from "./routes/auth.js";
import habitsRoute from "./routes/habits.js";
import chatRoute from "./routes/chat.js";
import progressRoute from "./routes/progress.js";
import User from "./models/User.js";
import Habit from "./models/Habit.js";
import { sendEmail } from "./utils/emailHelper.js";
import { generateMorningEmail, generateEveningEmail } from "./utils/emailTemplates.js";

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

// Serve Static Frontend Files from the "public" directory securely
app.use(express.static(path.join(__dirname, "public")));

// API Routes
app.use("/api", authRoute);
app.use("/api/habits", habitsRoute);
app.use("/api/chat", chatRoute);
app.use("/api/progress", progressRoute);

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const getTodayContext = (timeZone) => {
  const now = new Date();
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);

  const year = dateParts.find((part) => part.type === "year")?.value || "0000";
  const month = dateParts.find((part) => part.type === "month")?.value || "01";
  const day = dateParts.find((part) => part.type === "day")?.value || "01";
  const weekdayShort = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short"
  }).format(now);

  return {
    todayKey: `${year}-${month}-${day}`,
    dayIndex: WEEKDAY_INDEX[weekdayShort] ?? 0
  };
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

const runMorningBriefingJob = async () => {
  const { dayIndex } = getTodayContext(CRON_TIMEZONE);

  try {
    const users = await User.find({}, { name: 1, email: 1 }).lean();

    for (const user of users) {
      if (!user.email) continue;

      try {
        const habits = await Habit.find({ user_id: user._id }).lean();
        const todaysHabits = habits
          .filter((habit) => getHabitFrequency(habit).includes(dayIndex))
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
  const { todayKey, dayIndex } = getTodayContext(CRON_TIMEZONE);

  try {
    const users = await User.find({}, { name: 1, email: 1 }).lean();

    for (const user of users) {
      if (!user.email) continue;

      try {
        const habits = await Habit.find({ user_id: user._id }).lean();
        const scheduledToday = habits.filter((habit) => getHabitFrequency(habit).includes(dayIndex));

        let completed = 0;
        let missed = 0;

        for (const habit of scheduledToday) {
          const status = getTodayHabitStatus(habit, todayKey);
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
        }
      } catch (error) {
        console.error(`Evening report user processing failed for ${user.email}:`, error.message);
      }
    }
  } catch (error) {
    console.error("Evening report job failed:", error.message);
  }
};

const initializeEmailCronJobs = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("Email cron jobs are disabled. Missing EMAIL_USER or EMAIL_PASS in environment.");
    return;
  }

  // 07:00 daily morning briefing
  cron.schedule("0 7 * * *", () => {
    void runMorningBriefingJob();
  }, { timezone: CRON_TIMEZONE });

  // 23:59 daily evening report
  cron.schedule("59 23 * * *", () => {
    void runEveningReportJob();
  }, { timezone: CRON_TIMEZONE });

  console.log(`Email cron jobs initialized in timezone: ${CRON_TIMEZONE}`);
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

