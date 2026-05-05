import express from "express";
import Habit from "../models/Habit.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();
const DEFAULT_TIMEZONE = "UTC";

const isValidTimeZone = (timezone) => {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

const getUserTimezone = (req) => {
  const timezone = req.header("x-user-timezone");
  if (!timezone || typeof timezone !== "string") return DEFAULT_TIMEZONE;
  return isValidTimeZone(timezone) ? timezone : DEFAULT_TIMEZONE;
};

const getDateKeyInTimezone = (date, timezone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
};

const toDateFromKey = (key) => new Date(`${key}T00:00:00.000Z`);
const toKeyFromDate = (date) => date.toISOString().slice(0, 10);

const shiftDateKey = (key, deltaDays) => {
  const date = toDateFromKey(key);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return toKeyFromDate(date);
};

const dateKeyInRange = (key, startKey, endKey) => key >= startKey && key <= endKey;

const monthName = (monthIndex) => {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return names[monthIndex];
};

const roundPercent = (value) => Math.round(value * 10) / 10;

const getDateRange = (period, timezone) => {
  const todayKey = getDateKeyInTimezone(new Date(), timezone);
  const year = Number(todayKey.slice(0, 4));
  const month = Number(todayKey.slice(5, 7));

  switch (period) {
    case "day":
      return { startKey: todayKey, endKey: todayKey, todayKey };
    case "week":
      return { startKey: shiftDateKey(todayKey, -6), endKey: todayKey, todayKey };
    case "month":
      return { startKey: `${year}-${String(month).padStart(2, "0")}-01`, endKey: todayKey, todayKey };
    case "year":
      return { startKey: `${year}-01-01`, endKey: todayKey, todayKey };
    default:
      return { startKey: shiftDateKey(todayKey, -6), endKey: todayKey, todayKey };
  }
};

const buildTrend = (period, startKey, endKey, dayMap) => {
  if (period === "year") {
    const year = startKey.slice(0, 4);
    const buckets = [];
    for (let month = 1; month <= 12; month += 1) {
      const monthKey = `${year}-${String(month).padStart(2, "0")}`;
      let completed = 0;
      let missed = 0;
      for (const [dateKey, stats] of dayMap.entries()) {
        if (dateKey.startsWith(monthKey) && dateKey <= endKey) {
          completed += stats.completed;
          missed += stats.missed;
        }
      }
      buckets.push({
        label: monthName(month - 1),
        completed,
        missed
      });
    }
    return buckets;
  }

  const trend = [];
  let cursor = startKey;
  while (cursor <= endKey) {
    const stats = dayMap.get(cursor) || { completed: 0, missed: 0 };
    trend.push({
      label: cursor,
      completed: stats.completed,
      missed: stats.missed
    });
    cursor = shiftDateKey(cursor, 1);
  }
  return trend;
};

const getProgressForPeriod = async (userId, period, timezone) => {
  const { startKey, endKey } = getDateRange(period, timezone);
  const habits = await Habit.find({ user_id: userId }).select("history");

  const dayMap = new Map();
  let completed = 0;
  let missed = 0;

  for (const habit of habits) {
    const history = Array.isArray(habit.history) ? habit.history : [];
    for (const entry of history) {
      if (!entry?.date || !entry?.status) continue;
      if (!dateKeyInRange(entry.date, startKey, endKey)) continue;

      const dayStats = dayMap.get(entry.date) || { completed: 0, missed: 0 };

      if (entry.status === "completed") {
        dayStats.completed += 1;
        completed += 1;
      } else if (entry.status === "missed") {
        dayStats.missed += 1;
        missed += 1;
      }

      dayMap.set(entry.date, dayStats);
    }
  }

  const denominator = completed + missed;
  const completionRate = denominator > 0 ? roundPercent((completed / denominator) * 100) : 0;
  const trend = buildTrend(period, startKey, endKey, dayMap);

  const currentStreak = (() => {
    let streak = 0;
    let cursor = endKey;
    while (cursor >= startKey) {
      const stats = dayMap.get(cursor) || { completed: 0, missed: 0 };
      if (stats.completed > 0 && stats.missed === 0) {
        streak += 1;
        cursor = shiftDateKey(cursor, -1);
      } else {
        break;
      }
    }
    return streak;
  })();

  return {
    period,
    range: { startKey, endKey },
    summary: {
      totalCompleted: completed,
      totalMissed: missed,
      completionRate,
      activeHabits: habits.length,
      currentStreak
    },
    charts: {
      completedVsMissed: {
        labels: ["Completed", "Missed"],
        values: [completed, missed]
      },
      trend
    }
  };
};

const createProgressHandler = (period) => async (req, res) => {
  try {
    const timezone = getUserTimezone(req);
    const payload = await getProgressForPeriod(req.user.id, period, timezone);
    res.status(200).json(payload);
  } catch (err) {
    res.status(500).json({ error: "Failed to load progress data.", details: err.message });
  }
};

router.get("/day", protect, createProgressHandler("day"));
router.get("/week", protect, createProgressHandler("week"));
router.get("/month", protect, createProgressHandler("month"));
router.get("/year", protect, createProgressHandler("year"));

export default router;
