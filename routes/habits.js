import express from "express";
import Habit from "../models/Habit.js";
import User from "../models/User.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();
const DEFAULT_TIMEZONE = "UTC";
const VALID_HISTORY_STATUSES = new Set(["pending", "completed", "missed"]);
const VALID_TIME_OF_DAY = new Set(["Morning", "Afternoon", "Evening"]);
const VALID_DIFFICULTY = new Set(["easy", "medium", "hard"]);

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

const shiftDateKey = (dateStr, days) => {
  const parts = dateStr.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const date = new Date(year, month, day, 12, 0, 0);
  date.setDate(date.getDate() + days);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const calculateStreakAndCheckBadges = (user, habits, todayKey) => {
  const activeDays = getActiveDaysFromSettings(user);
  const dayMap = new Map();
  
  for (const habit of habits) {
    for (const record of habit.history || []) {
      if (!isHabitScheduledForDate(habit, record.date, activeDays)) continue;
      const stats = dayMap.get(record.date) || { completed: 0, missed: 0, pending: 0 };
      if (record.status === "completed") {
        stats.completed += 1;
      } else if (record.status === "missed") {
        stats.missed += 1;
      } else if (record.status === "pending") {
        stats.pending += 1;
      }
      dayMap.set(record.date, stats);
    }
  }

  let streak = 0;
  let cursor = todayKey;
  
  const todayStats = dayMap.get(todayKey) || { completed: 0, missed: 0, pending: 0 };
  if (todayStats.completed === 0 && todayStats.missed === 0) {
    cursor = shiftDateKey(todayKey, -1);
  }

  for (let i = 0; i < 365; i++) {
    if (user.frozenDates && user.frozenDates.includes(cursor)) {
      cursor = shiftDateKey(cursor, -1);
      continue;
    }

    const stats = dayMap.get(cursor);
    if (stats && stats.completed > 0 && stats.missed === 0) {
      streak += 1;
      cursor = shiftDateKey(cursor, -1);
    } else {
      break;
    }
  }

  const unlocked = new Set(user.badges || []);
  const newlyUnlocked = [];

  const addBadge = (id) => {
    if (!unlocked.has(id)) {
      unlocked.add(id);
      newlyUnlocked.push(id);
    }
  };

  const totalCompleted = habits.reduce((sum, h) => {
    return sum + (h.history || []).filter(r => r.status === "completed").length;
  }, 0);
  if (totalCompleted >= 1) addBadge("first-habit");

  if (streak >= 3) addBadge("streak-3");
  if (streak >= 7) addBadge("streak-7");
  if (streak >= 30) addBadge("streak-30");

  if (user.level >= 5) addBadge("level-5");

  const checkPerfectDayForDate = (dateKey) => {
    let scheduledCount = 0;
    let completedCount = 0;
    for (const habit of habits) {
      if (!isHabitScheduledForDate(habit, dateKey, activeDays)) continue;
      const record = habit.history?.find(r => r.date === dateKey);
      scheduledCount += 1;
      if (record?.status === "completed") {
        completedCount += 1;
      }
    }
    return scheduledCount > 0 && completedCount === scheduledCount;
  };

  if (checkPerfectDayForDate(todayKey) || checkPerfectDayForDate(shiftDateKey(todayKey, -1))) {
    addBadge("perfect-day");
  }

  if (newlyUnlocked.length > 0) {
    user.badges = Array.from(unlocked);
  }

  return { streak, newlyUnlocked };
};

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

const normalizeDifficulty = (value) => {
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== "string") {
    return { ok: false, error: "Difficulty must be easy, medium, or hard." };
  }

  const cleanValue = value.trim().toLowerCase();
  if (!VALID_DIFFICULTY.has(cleanValue)) {
    return { ok: false, error: "Difficulty must be easy, medium, or hard." };
  }

  return { ok: true, value: cleanValue };
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

const getHabitFrequency = (habit) => {
  if (!Array.isArray(habit.frequency) || habit.frequency.length === 0) {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  const normalizedDays = habit.frequency
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return normalizedDays.length > 0 ? normalizedDays : [0, 1, 2, 3, 4, 5, 6];
};

const getDayIndexFromKey = (dateKey) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  return date.getDay();
};

const getActiveDaysFromSettings = (user) => {
  const defaults = user?.settings?.habitDefaults || {};
  if (defaults.frequencyPreset === "weekdays") return [1, 2, 3, 4, 5];
  if (defaults.frequencyPreset === "custom" && Array.isArray(defaults.customFrequency) && defaults.customFrequency.length) {
    const days = defaults.customFrequency
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
    return days.length ? [...new Set(days)] : [1, 2, 3, 4, 5];
  }
  return [0, 1, 2, 3, 4, 5, 6];
};

const isHabitScheduledForDate = (habit, dateKey, activeDays = [0, 1, 2, 3, 4, 5, 6]) => {
  const dayIndex = getDayIndexFromKey(dateKey);
  return activeDays.includes(dayIndex) && getHabitFrequency(habit).includes(dayIndex);
};

const buildHistoryForLegacyHabit = (habit, timezone, activeDays = [0, 1, 2, 3, 4, 5, 6]) => {
  const todayKey = getTodayKey(timezone);
  const createdKey = getDateKeyInTimezone(habit.createdAt || new Date(), timezone);
  const startKey = createdKey <= todayKey ? createdKey : todayKey;
  const dateKeys = enumerateDateKeys(startKey, todayKey);

  const legacyStatus = habit.status === "completed" || habit.completed ? "completed" : "pending";
  const freq = getHabitFrequency(habit);

  const history = [];
  for (const dateKey of dateKeys) {
    const dayIndex = getDayIndexFromKey(dateKey);
    if (activeDays.includes(dayIndex) && freq.includes(dayIndex)) {
      const isToday = dateKey === todayKey;
      history.push({
        date: dateKey,
        status: isToday ? legacyStatus : "missed",
        locked: !isToday
      });
    }
  }

  return history;
};

const normalizeHistory = (habit, timezone, activeDays = [0, 1, 2, 3, 4, 5, 6]) => {
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

    if (!isHabitScheduledForDate(habit, record.date, activeDays)) {
      mutated = true;
      continue;
    }

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

  const freq = getHabitFrequency(habit);

  if (mapByDate.size === 0) {
    const legacyHistory = buildHistoryForLegacyHabit(habit, timezone, activeDays);
    for (const record of legacyHistory) {
      mapByDate.set(record.date, record);
    }
    mutated = true;
  } else {
    const sortedKeys = [...mapByDate.keys()].sort((a, b) => a.localeCompare(b));
    const earliestKey = sortedKeys[0];
    const dateKeys = enumerateDateKeys(earliestKey, todayKey);

    for (const dateKey of dateKeys) {
      if (!mapByDate.has(dateKey)) {
        const dayIndex = getDayIndexFromKey(dateKey);
        if (activeDays.includes(dayIndex) && freq.includes(dayIndex)) {
          const isToday = dateKey === todayKey;
          mapByDate.set(dateKey, {
            date: dateKey,
            status: isToday ? "pending" : "missed",
            locked: !isToday
          });
          mutated = true;
        }
      }
    }
  }

  const isTodayScheduled = isHabitScheduledForDate(habit, todayKey, activeDays);

  if (isTodayScheduled && !mapByDate.has(todayKey)) {
    mapByDate.set(todayKey, {
      date: todayKey,
      status: "pending",
      locked: false
    });
    mutated = true;
  }

  const normalizedHistory = [...mapByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const todayRecord = normalizedHistory.find((record) => record.date === todayKey);
  const todayStatus = isTodayScheduled ? (todayRecord?.status || "pending") : "pending";

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
      locked: !isTodayScheduled
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
    const user = await User.findById(req.user.id).select("settings.habitDefaults");
    const activeDays = getActiveDaysFromSettings(user);
    const responseHabits = [];

    for (const habit of habits) {
      const { mutated, todayRecord } = normalizeHistory(habit, timezone, activeDays);
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
    const user = await User.findById(req.user.id).select("settings.habitDefaults");
    const activeDays = getActiveDaysFromSettings(user);
    const { title, description, frequency, timeOfDay, difficulty, yearlyGoal, emoji, color } = req.body;

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
    const difficultyResult = normalizeDifficulty(difficulty);
    const yearlyGoalResult = normalizeYearlyGoal(yearlyGoal);

    if (!frequencyResult.ok) {
      return res.status(400).json({ error: frequencyResult.error });
    }
    if (!timeOfDayResult.ok) {
      return res.status(400).json({ error: timeOfDayResult.error });
    }
    if (!difficultyResult.ok) {
      return res.status(400).json({ error: difficultyResult.error });
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
    const resolvedFrequency = frequencyResult.value || [0, 1, 2, 3, 4, 5, 6];
    const todayDayIndex = getDayIndexFromKey(todayKey);
    const isScheduledToday = activeDays.includes(todayDayIndex) && resolvedFrequency.includes(todayDayIndex);
    const habitPayload = {
      title: cleanTitle,
      description: cleanDescription,
      completed: false,
      status: "pending",
      user_id: req.user.id,
      emoji: emoji && typeof emoji === "string" ? emoji.trim() : "📅",
      color: color && typeof color === "string" ? color.trim() : "#2563eb",
      history: isScheduledToday ? [{
        date: todayKey,
        status: "pending",
        locked: false
      }] : []
    };

    if (frequencyResult.value !== undefined) habitPayload.frequency = frequencyResult.value;
    if (timeOfDayResult.value !== undefined) habitPayload.timeOfDay = timeOfDayResult.value;
    if (difficultyResult.value !== undefined) habitPayload.difficulty = difficultyResult.value;
    if (yearlyGoalResult.value !== undefined) habitPayload.yearlyGoal = yearlyGoalResult.value;

    const habit = await Habit.create(habitPayload);

    res.status(201).json(serializeHabit(habit, habit.history[0] || {
      date: todayKey,
      status: "pending",
      locked: true
    }));
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

    const { title, description, status, date, frequency, timeOfDay, difficulty, yearlyGoal, emoji, color } = req.body;

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
    const difficultyResult = normalizeDifficulty(difficulty);
    const yearlyGoalResult = normalizeYearlyGoal(yearlyGoal);

    if (!frequencyResult.ok) {
      return res.status(400).json({ error: frequencyResult.error });
    }
    if (!timeOfDayResult.ok) {
      return res.status(400).json({ error: timeOfDayResult.error });
    }
    if (!difficultyResult.ok) {
      return res.status(400).json({ error: difficultyResult.error });
    }
    if (!yearlyGoalResult.ok) {
      return res.status(400).json({ error: yearlyGoalResult.error });
    }

    const user = await User.findById(req.user.id);
    const activeDays = getActiveDaysFromSettings(user);
    const normalized = normalizeHistory(habit, timezone, activeDays);
    const todayKey = normalized.todayKey;
    const targetDate = (typeof date === "string" && isDateKey(date)) ? date : todayKey;
    const todayScheduled = isHabitScheduledForDate(habit, todayKey, activeDays);

    if (targetDate !== todayKey) {
      return res.status(409).json({ error: "Today's deadline passed." });
    }

    if (status !== undefined && !todayScheduled) {
      return res.status(409).json({ error: "No habit is scheduled for today." });
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

    if (difficulty !== undefined) {
      habit.difficulty = difficultyResult.value;
    }

    if (yearlyGoal !== undefined) {
      habit.yearlyGoal = yearlyGoalResult.value;
    }

    if (emoji !== undefined && typeof emoji === "string") {
      habit.emoji = emoji.trim();
    }

    if (color !== undefined && typeof color === "string") {
      habit.color = color.trim();
    }

    const todayRecordIndex = habit.history.findIndex((record) => record.date === todayKey);
    if (todayScheduled && todayRecordIndex === -1) {
      habit.history.push({ date: todayKey, status: "pending", locked: false });
    }

    const currentTodayRecord = habit.history.find((record) => record.date === todayKey);
    if (status !== undefined && currentTodayRecord?.locked) {
      return res.status(409).json({ error: "Today's deadline passed." });
    }

    let xpEarned = 0;
    let levelUp = false;
    const oldStatus = currentTodayRecord?.status || "pending";

    if (status !== undefined && currentTodayRecord) {
      currentTodayRecord.status = status;
      currentTodayRecord.locked = false;
    }

    if (user && status !== undefined && oldStatus !== status) {
      const xpByDifficulty = { easy: 10, medium: 20, hard: 40 };
      const baseXP = xpByDifficulty[habit.difficulty] || 20;

      if (oldStatus !== "completed" && status === "completed") {
        user.xp += baseXP;
        xpEarned = baseXP;
        let nextLevelXp = user.level * 100;
        while (user.xp >= nextLevelXp) {
          user.xp -= nextLevelXp;
          user.level += 1;
          user.streakFreezes += 1;
          levelUp = true;
          nextLevelXp = user.level * 100;
        }
      } else if (oldStatus === "completed" && status !== "completed") {
        user.xp = Math.max(0, user.xp - baseXP);
        xpEarned = -baseXP;
      }
    }

    habit.status = currentTodayRecord?.status || "pending";
    habit.completed = currentTodayRecord?.status === "completed";

    await habit.save();
    const finalState = normalizeHistory(habit, timezone, activeDays);
    if (finalState.mutated) {
      await habit.save();
    }

    let streakResult = { streak: 0, newlyUnlocked: [] };
    if (user) {
      const allUserHabits = await Habit.find({ user_id: req.user.id });
      streakResult = calculateStreakAndCheckBadges(user, allUserHabits, todayKey);
      await user.save();
    }

    res.status(200).json({
      habit: serializeHabit(habit, finalState.todayRecord),
      xpEarned,
      levelUp,
      gamification: user ? {
        xp: user.xp,
        level: user.level,
        streakFreezes: user.streakFreezes,
        frozenDates: user.frozenDates,
        badges: user.badges,
        currentStreak: streakResult.streak,
        newlyUnlockedBadges: streakResult.newlyUnlocked
      } : null
    });
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
