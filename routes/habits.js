import express from "express";
import Habit from "../models/Habit.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();
const DEFAULT_TIMEZONE = "UTC";
const VALID_HISTORY_STATUSES = new Set(["pending", "completed", "missed"]);
const VALID_TIME_OF_DAY = new Set(["Morning", "Afternoon", "Evening"]);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

const getTodayKey = (timezone) => getDateKeyInTimezone(new Date(), timezone);

const isDateKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const normalizeFrequency = (value) => {
  if (value === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: "Frequency must be a non-empty array of day numbers (0-6)." };
  }

  const normalized = [...new Set(value.map((day) => Number(day)))].sort((a, b) => a - b);
  const isValid = normalized.every((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  if (!isValid) {
    return { ok: false, error: "Frequency must contain only integers from 0 to 6." };
  }

  return { ok: true, value: normalized };
};

const normalizeTimeOfDay = (value) => {
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== "string") {
    return { ok: false, error: "Time of day must be Morning, Afternoon, or Evening." };
  }

  const cleanValue = value.trim();
  if (!VALID_TIME_OF_DAY.has(cleanValue)) {
    return { ok: false, error: "Time of day must be Morning, Afternoon, or Evening." };
  }

  return { ok: true, value: cleanValue };
};

const normalizeYearlyGoal = (value) => {
  if (value === undefined) return { ok: true, value: undefined };
  const numericGoal = Number(value);
  if (!Number.isInteger(numericGoal) || numericGoal < 1 || numericGoal > 366) {
    return { ok: false, error: "Yearly goal must be an integer between 1 and 366." };
  }

  return { ok: true, value: numericGoal };
};

const enumerateDateKeys = (startKey, endKey) => {
  const dates = [];
  let cursor = new Date(`${startKey}T00:00:00.000Z`);
  const end = new Date(`${endKey}T00:00:00.000Z`);

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
};

const buildHistoryForLegacyHabit = (habit, timezone) => {
  const todayKey = getTodayKey(timezone);
  const createdKey = getDateKeyInTimezone(habit.createdAt || new Date(), timezone);
  const startKey = createdKey <= todayKey ? createdKey : todayKey;
  const dateKeys = enumerateDateKeys(startKey, todayKey);

  const legacyStatus = habit.status === "completed" || habit.completed ? "completed" : "pending";

  return dateKeys.map((dateKey) => {
    const isToday = dateKey === todayKey;
    return {
      date: dateKey,
      status: isToday ? legacyStatus : "missed",
      locked: !isToday
    };
  });
};

const normalizeHistory = (habit, timezone) => {
  const todayKey = getTodayKey(timezone);
  let mutated = false;

  const mapByDate = new Map();
  const rawHistory = Array.isArray(habit.history) ? habit.history : [];

  for (const record of rawHistory) {
    if (!record || !isDateKey(record.date)) {
      mutated = true;
      continue;
    }

    const incomingStatus = VALID_HISTORY_STATUSES.has(record.status) ? record.status : "pending";
    if (incomingStatus !== record.status) mutated = true;

    let status = incomingStatus;
    let locked = Boolean(record.locked);

    if (record.date < todayKey) {
      if (status === "pending") {
        status = "missed";
      }
      locked = true;
    } else if (record.date === todayKey) {
      locked = false;
    }

    if (status !== incomingStatus || locked !== Boolean(record.locked)) mutated = true;
    mapByDate.set(record.date, { date: record.date, status, locked });
  }

  if (mapByDate.size === 0) {
    const legacyHistory = buildHistoryForLegacyHabit(habit, timezone);
    for (const record of legacyHistory) {
      mapByDate.set(record.date, record);
    }
    mutated = true;
  } else if (!mapByDate.has(todayKey)) {
    mapByDate.set(todayKey, {
      date: todayKey,
      status: "pending",
      locked: false
    });
    mutated = true;
  }

  const normalizedHistory = [...mapByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const todayRecord = normalizedHistory.find((record) => record.date === todayKey);
  const todayStatus = todayRecord?.status || "pending";

  if (habit.status !== todayStatus) {
    habit.status = todayStatus;
    mutated = true;
  }

  const completedToday = todayStatus === "completed";
  if (habit.completed !== completedToday) {
    habit.completed = completedToday;
    mutated = true;
  }

  if (mutated) {
    habit.history = normalizedHistory;
  }

  return {
    mutated,
    todayKey,
    history: normalizedHistory,
    todayRecord: todayRecord || {
      date: todayKey,
      status: "pending",
      locked: false
    }
  };
};

const serializeHabit = (habit, todayRecord) => {
  const habitObj = habit.toObject();
  return {
    ...habitObj,
    today: todayRecord,
    status: todayRecord.status,
    completed: todayRecord.status === "completed"
  };
};

// Get all habits for the logged-in user
router.get("/", protect, async (req, res) => {
  try {
    const timezone = getUserTimezone(req);
    const habits = await Habit.find({ user_id: req.user.id }).sort("-createdAt");
    const responseHabits = [];

    for (const habit of habits) {
      const { mutated, todayRecord } = normalizeHistory(habit, timezone);
      if (mutated) {
        await habit.save();
      }
      responseHabits.push(serializeHabit(habit, todayRecord));
    }

    res.status(200).json(responseHabits);
  } catch (err) {
    res.status(500).json({ error: "Server Error", details: err.message });
  }
});

// Create a new habit
router.post("/", protect, async (req, res) => {
  try {
    const timezone = getUserTimezone(req);
    const { title, description, frequency, timeOfDay, yearlyGoal } = req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Please add a valid title" });
    }

    if (title.trim().length > 100) {
      return res.status(400).json({ error: "Title exceeds maximum length of 100 characters." });
    }

    if (description && (typeof description !== "string" || description.trim().length > 500)) {
      return res.status(400).json({ error: "Description exceeds maximum length of 500 characters." });
    }

    const cleanTitle = title.trim().replace(/\s+/g, " ");
    const cleanDescription = typeof description === "string" ? description.trim() : "";
    const frequencyResult = normalizeFrequency(frequency);
    const timeOfDayResult = normalizeTimeOfDay(timeOfDay);
    const yearlyGoalResult = normalizeYearlyGoal(yearlyGoal);

    if (!frequencyResult.ok) {
      return res.status(400).json({ error: frequencyResult.error });
    }
    if (!timeOfDayResult.ok) {
      return res.status(400).json({ error: timeOfDayResult.error });
    }
    if (!yearlyGoalResult.ok) {
      return res.status(400).json({ error: yearlyGoalResult.error });
    }

    const duplicateHabit = await Habit.findOne({
      user_id: req.user.id,
      title: {
        $regex: `^${escapeRegex(cleanTitle)}$`,
        $options: "i"
      }
    });

    if (duplicateHabit) {
      return res.status(409).json({ error: "This habit already exists." });
    }

    const todayKey = getTodayKey(timezone);
    const habitPayload = {
      title: cleanTitle,
      description: cleanDescription,
      completed: false,
      status: "pending",
      user_id: req.user.id,
      history: [{
        date: todayKey,
        status: "pending",
        locked: false
      }]
    };

    if (frequencyResult.value !== undefined) habitPayload.frequency = frequencyResult.value;
    if (timeOfDayResult.value !== undefined) habitPayload.timeOfDay = timeOfDayResult.value;
    if (yearlyGoalResult.value !== undefined) habitPayload.yearlyGoal = yearlyGoalResult.value;

    const habit = await Habit.create(habitPayload);

    res.status(201).json(serializeHabit(habit, habit.history[0]));
  } catch (err) {
    res.status(500).json({ error: "Server Error", details: err.message });
  }
});

// Update a habit
router.put("/:id", protect, async (req, res) => {
  try {
    const timezone = getUserTimezone(req);
    const habit = await Habit.findById(req.params.id);

    if (!habit) {
      return res.status(404).json({ error: "Habit not found" });
    }

    if (habit.user_id.toString() !== req.user.id) {
      return res.status(401).json({ error: "User not authorized to update this habit" });
    }

    const { title, description, status, date, frequency, timeOfDay, yearlyGoal } = req.body;

    if (title !== undefined && (typeof title !== "string" || !title.trim() || title.trim().length > 100)) {
      return res.status(400).json({ error: "Invalid title. Must be between 1 and 100 characters." });
    }

    if (description !== undefined && (typeof description !== "string" || description.trim().length > 500)) {
      return res.status(400).json({ error: "Description exceeds maximum length." });
    }

    if (status !== undefined && !["pending", "completed"].includes(status)) {
      return res.status(400).json({ error: "Invalid status update." });
    }

    const frequencyResult = normalizeFrequency(frequency);
    const timeOfDayResult = normalizeTimeOfDay(timeOfDay);
    const yearlyGoalResult = normalizeYearlyGoal(yearlyGoal);

    if (!frequencyResult.ok) {
      return res.status(400).json({ error: frequencyResult.error });
    }
    if (!timeOfDayResult.ok) {
      return res.status(400).json({ error: timeOfDayResult.error });
    }
    if (!yearlyGoalResult.ok) {
      return res.status(400).json({ error: yearlyGoalResult.error });
    }

    const normalized = normalizeHistory(habit, timezone);
    const todayKey = normalized.todayKey;
    const targetDate = (typeof date === "string" && isDateKey(date)) ? date : todayKey;

    if (targetDate !== todayKey) {
      return res.status(409).json({ error: "Today's deadline passed." });
    }

    if (title !== undefined) {
      const cleanTitle = title.trim().replace(/\s+/g, " ");
      const duplicateHabit = await Habit.findOne({
        _id: { $ne: req.params.id },
        user_id: req.user.id,
        title: {
          $regex: `^${escapeRegex(cleanTitle)}$`,
          $options: "i"
        }
      });

      if (duplicateHabit) {
        return res.status(409).json({ error: "A habit with this title already exists." });
      }

      habit.title = cleanTitle;
    }

    if (description !== undefined) {
      habit.description = description.trim();
    }

    if (frequency !== undefined) {
      habit.frequency = frequencyResult.value;
    }

    if (timeOfDay !== undefined) {
      habit.timeOfDay = timeOfDayResult.value;
    }

    if (yearlyGoal !== undefined) {
      habit.yearlyGoal = yearlyGoalResult.value;
    }

    const todayRecordIndex = habit.history.findIndex((record) => record.date === todayKey);
    if (todayRecordIndex === -1) {
      habit.history.push({ date: todayKey, status: "pending", locked: false });
    }

    const currentTodayRecord = habit.history.find((record) => record.date === todayKey);
    if (currentTodayRecord.locked) {
      return res.status(409).json({ error: "Today's deadline passed." });
    }

    if (status !== undefined) {
      currentTodayRecord.status = status;
      currentTodayRecord.locked = false;
    }

    habit.status = currentTodayRecord.status;
    habit.completed = currentTodayRecord.status === "completed";

    await habit.save();
    const finalState = normalizeHistory(habit, timezone);
    if (finalState.mutated) {
      await habit.save();
    }

    res.status(200).json(serializeHabit(habit, finalState.todayRecord));
  } catch (err) {
    res.status(500).json({ error: "Server Error", details: err.message });
  }
});

// Delete a habit
router.delete("/:id", protect, async (req, res) => {
  try {
    const habit = await Habit.findById(req.params.id);

    if (!habit) {
      return res.status(404).json({ error: "Habit not found" });
    }

    if (habit.user_id.toString() !== req.user.id) {
      return res.status(401).json({ error: "User not authorized to delete this habit" });
    }

    await habit.deleteOne();
    res.status(200).json({ id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: "Server Error", details: err.message });
  }
});

export default router;
