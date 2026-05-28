import express from "express";
import User from "../models/User.js";
import Habit from "../models/Habit.js";
import DailyReview from "../models/DailyReview.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

const VALID_TIME_OF_DAY = new Set(["Morning", "Afternoon", "Evening"]);
const VALID_DIFFICULTY = new Set(["easy", "medium", "hard"]);
const VALID_COACHING_STYLE = new Set(["gentle", "balanced", "strict"]);
const VALID_INTENSITY = new Set(["light", "normal", "aggressive"]);
const VALID_START_PAGE = new Set(["dashboard", "planning", "progress", "social"]);
const VALID_FREQUENCY_PRESET = new Set(["everyday", "weekdays", "custom"]);
const VALID_FOCUS_AREAS = new Set(["productivity", "health", "learning", "fitness"]);

const sanitizeString = (value, fallback = "", maxLength = 120) => {
  if (typeof value !== "string") return fallback;
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength) || fallback;
};

const sanitizeTime = (value, fallback = "18:00") => {
  if (typeof value !== "string") return fallback;
  return /^\d{2}:\d{2}$/.test(value) ? value : fallback;
};

const sanitizeFrequency = (value) => {
  if (!Array.isArray(value)) return [1, 2, 3, 4, 5];
  const days = [...new Set(value.map((day) => Number(day)))]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b);
  return days.length ? days : [1, 2, 3, 4, 5];
};

const boolOrDefault = (value, fallback) => typeof value === "boolean" ? value : fallback;

const serializeUserSettings = (user) => ({
  profile: {
    name: user.name,
    email: user.email,
    timezone: user.timezone || "UTC"
  },
  settings: user.settings || {},
  xp: user.xp || 0,
  level: user.level || 1,
  streakFreezes: user.streakFreezes || 0,
  frozenDates: user.frozenDates || [],
  badges: user.badges || []
});

router.get("/", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password").lean();
    if (!user) return res.status(404).json({ error: "User not found." });
    res.status(200).json(serializeUserSettings(user));
  } catch (error) {
    res.status(500).json({ error: "Failed to load settings.", details: error.message });
  }
});

router.put("/", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found." });

    const incomingProfile = req.body.profile || {};
    const incoming = req.body.settings || {};

    const nextEmail = sanitizeString(incomingProfile.email, user.email, 180).toLowerCase();
    if (!nextEmail.includes("@")) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    const duplicateEmail = await User.findOne({ _id: { $ne: user._id }, email: nextEmail }).select("_id");
    if (duplicateEmail) {
      return res.status(409).json({ error: "That email is already in use." });
    }

    user.name = sanitizeString(incomingProfile.name, user.name, 80);
    user.email = nextEmail;
    user.timezone = sanitizeString(incomingProfile.timezone, user.timezone || "UTC", 80);

    const current = user.settings || {};
    const aiCoach = incoming.aiCoach || {};
    const notifications = incoming.notifications || {};
    const habitDefaults = incoming.habitDefaults || {};
    const dashboard = incoming.dashboard || {};

    const focusAreas = Array.isArray(aiCoach.focusAreas)
      ? aiCoach.focusAreas.filter((area) => VALID_FOCUS_AREAS.has(area))
      : current.aiCoach?.focusAreas;

    const VALID_THEME = new Set(["light", "obsidian", "nord", "sepia"]);

    user.settings = {
      aiCoach: {
        coachingStyle: VALID_COACHING_STYLE.has(aiCoach.coachingStyle) ? aiCoach.coachingStyle : (current.aiCoach?.coachingStyle || "balanced"),
        focusAreas: focusAreas?.length ? focusAreas : ["productivity"],
        dailyCheckInTime: sanitizeTime(aiCoach.dailyCheckInTime, current.aiCoach?.dailyCheckInTime || "18:00"),
        recommendationIntensity: VALID_INTENSITY.has(aiCoach.recommendationIntensity) ? aiCoach.recommendationIntensity : (current.aiCoach?.recommendationIntensity || "normal")
      },
      notifications: {
        morningBriefing: boolOrDefault(notifications.morningBriefing, current.notifications?.morningBriefing ?? true),
        eveningReview: boolOrDefault(notifications.eveningReview, current.notifications?.eveningReview ?? true),
        missedHabitReminders: boolOrDefault(notifications.missedHabitReminders, current.notifications?.missedHabitReminders ?? true),
        weeklyProgressReport: boolOrDefault(notifications.weeklyProgressReport, current.notifications?.weeklyProgressReport ?? true)
      },
      habitDefaults: {
        difficulty: VALID_DIFFICULTY.has(habitDefaults.difficulty) ? habitDefaults.difficulty : (current.habitDefaults?.difficulty || "medium"),
        timeOfDay: VALID_TIME_OF_DAY.has(habitDefaults.timeOfDay) ? habitDefaults.timeOfDay : (current.habitDefaults?.timeOfDay || "Morning"),
        frequencyPreset: VALID_FREQUENCY_PRESET.has(habitDefaults.frequencyPreset) ? habitDefaults.frequencyPreset : (current.habitDefaults?.frequencyPreset || "everyday"),
        customFrequency: sanitizeFrequency(habitDefaults.customFrequency || current.habitDefaults?.customFrequency)
      },
      dashboard: {
        startPage: VALID_START_PAGE.has(dashboard.startPage) ? dashboard.startPage : (current.dashboard?.startPage || "dashboard"),
        showDailyReview: boolOrDefault(dashboard.showDailyReview, current.dashboard?.showDailyReview ?? true),
        showEnergyMatch: boolOrDefault(dashboard.showEnergyMatch, current.dashboard?.showEnergyMatch ?? true),
        compactMode: boolOrDefault(dashboard.compactMode, current.dashboard?.compactMode ?? false),
        theme: VALID_THEME.has(dashboard.theme) ? dashboard.theme : (current.dashboard?.theme || "light")
      }
    };

    await user.save();
    res.status(200).json(serializeUserSettings(user));
  } catch (error) {
    res.status(500).json({ error: "Failed to save settings.", details: error.message });
  }
});

router.put("/password", protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new password are required." });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters." });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found." });
    const matches = await user.matchPassword(currentPassword);
    if (!matches) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    user.password = newPassword;
    await user.save();
    res.status(200).json({ message: "Password updated." });
  } catch (error) {
    res.status(500).json({ error: "Failed to update password.", details: error.message });
  }
});

router.get("/export", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password -resetToken -verificationToken").lean();
    const habits = await Habit.find({ user_id: req.user.id }).lean();
    const reviews = await DailyReview.find({ user_id: req.user.id }).lean();
    res.status(200).json({
      exportedAt: new Date().toISOString(),
      user,
      habits,
      dailyReviews: reviews
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to export data.", details: error.message });
  }
});

router.delete("/habits", protect, async (req, res) => {
  try {
    const result = await Habit.deleteMany({ user_id: req.user.id });
    res.status(200).json({ deletedCount: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete habits.", details: error.message });
  }
});

router.delete("/account", protect, async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found." });

    const matches = await user.matchPassword(password || "");
    if (!matches) {
      return res.status(401).json({ error: "Password is required to delete your account." });
    }

    await Habit.deleteMany({ user_id: req.user.id });
    await DailyReview.deleteMany({ user_id: req.user.id });
    await user.deleteOne();
    res.status(200).json({ message: "Account deleted." });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete account.", details: error.message });
  }
});

router.post("/buy-freeze", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found." });

    if (user.xp < 150) {
      return res.status(400).json({ error: "Insufficient XP. Streak Freeze costs 150 XP." });
    }

    user.xp -= 150;
    user.streakFreezes += 1;
    await user.save();

    res.status(200).json(serializeUserSettings(user));
  } catch (error) {
    res.status(500).json({ error: "Failed to purchase Streak Freeze.", details: error.message });
  }
});

router.post("/apply-freeze", protect, async (req, res) => {
  try {
    const { date } = req.body;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "A valid date in YYYY-MM-DD format is required." });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found." });

    if (user.streakFreezes <= 0) {
      return res.status(400).json({ error: "No Streak Freezes available." });
    }

    if (user.frozenDates.includes(date)) {
      return res.status(400).json({ error: "This date is already frozen." });
    }

    user.streakFreezes -= 1;
    user.frozenDates.push(date);
    await user.save();

    res.status(200).json(serializeUserSettings(user));
  } catch (error) {
    res.status(500).json({ error: "Failed to apply Streak Freeze.", details: error.message });
  }
});

export default router;
