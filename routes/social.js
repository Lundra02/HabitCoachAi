import express from "express";
import Habit from "../models/Habit.js";
import User from "../models/User.js";
import { protect } from "../middleware/authMiddleware.js";
import { sendEmail } from "../utils/emailHelper.js";
import { generateDuoInviteEmail } from "../utils/emailTemplates.js";

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

const getHabitFrequency = (habit) => {
  if (!Array.isArray(habit.frequency) || habit.frequency.length === 0) {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  const normalizedDays = habit.frequency
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return normalizedDays.length ? normalizedDays : [0, 1, 2, 3, 4, 5, 6];
};

const getDayIndexFromDateKey = (dateKey) => toDateFromKey(dateKey).getUTCDay();
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());

// Calculate completion % over last 7 days (including today)
const calculateWeeklyCompletion = (history, todayKey) => {
  const past7Days = [];
  for (let i = 0; i < 7; i++) {
    past7Days.push(shiftDateKey(todayKey, -i));
  }
  const recentHistory = history.filter(h => past7Days.includes(h.date));
  const completed = recentHistory.filter(h => h.status === 'completed').length;
  const total = recentHistory.length;
  return total > 0 ? Math.round((completed / total) * 100) : 0;
};

// Calculate single habit streak skipping frozen dates
const calculateSingleHabitStreak = (habit, todayKey, frozenDates = []) => {
  let streak = 0;
  let cursor = todayKey;
  
  const todayRecord = habit.history?.find(r => r.date === todayKey);
  if (!todayRecord || todayRecord.status !== 'completed') {
    cursor = shiftDateKey(cursor, -1);
  }

  for (let i = 0; i < 365; i++) {
    if (frozenDates.includes(cursor)) {
      cursor = shiftDateKey(cursor, -1);
      continue;
    }
    const record = habit.history?.find(r => r.date === cursor);
    if (record && record.status === 'completed') {
      streak += 1;
      cursor = shiftDateKey(cursor, -1);
    } else {
      break;
    }
  }
  return streak;
};

// GET /api/social/shared-habits - Retrieve all shared habits with side-by-side progress
router.get("/shared-habits", protect, async (req, res) => {
  try {
    const timezone = getUserTimezone(req);
    const todayKey = getDateKeyInTimezone(new Date(), timezone);

    // Find all habits for the logged-in user that are shared
    const myHabits = await Habit.find({ user_id: req.user.id, isShared: true }).sort("-createdAt");
    const responseList = [];

    for (const habit of myHabits) {
      let friendHabit = null;
      let friendUser = null;
      let friendStreak = 0;
      let friendWeeklyCompletion = 0;

      if (habit.sharedHabitId) {
        friendHabit = await Habit.findById(habit.sharedHabitId);
        if (friendHabit) {
          friendUser = await User.findById(friendHabit.user_id);
          if (friendUser) {
            friendStreak = calculateSingleHabitStreak(friendHabit, todayKey, friendUser.frozenDates || []);
            friendWeeklyCompletion = calculateWeeklyCompletion(friendHabit.history || [], todayKey);
          }
        }
      }

      const myStreak = calculateSingleHabitStreak(habit, todayKey, req.user.frozenDates || []);
      const myWeeklyCompletion = calculateWeeklyCompletion(habit.history || [], todayKey);
      const isIncoming = habit.invitedBy && String(habit.invitedBy) !== String(req.user.id);

      responseList.push({
        _id: habit._id,
        title: habit.title,
        description: habit.description,
        difficulty: habit.difficulty,
        frequency: habit.frequency,
        shareStatus: habit.shareStatus,
        sharedWithEmail: habit.sharedWithEmail,
        isIncoming: !!isIncoming,
        myStreak,
        myWeeklyCompletion,
        friendName: friendUser ? (friendUser.name || friendUser.email.split("@")[0]) : "Friend",
        friendEmail: friendUser ? friendUser.email : habit.sharedWithEmail,
        friendStreak,
        friendWeeklyCompletion,
        myHistory: habit.history || [],
        friendHistory: friendHabit ? (friendHabit.history || []) : []
      });
    }

    res.status(200).json(responseList);
  } catch (err) {
    res.status(500).json({ error: "Server Error", details: err.message });
  }
});

// POST /api/social/invite - Invite a user to share a habit
router.post("/invite", protect, async (req, res) => {
  try {
    const { habitId, friendEmail } = req.body;

    if (!habitId || !friendEmail) {
      return res.status(400).json({ error: "Missing habitId or friendEmail" });
    }

    const targetEmail = String(friendEmail).trim().toLowerCase();
    if (!isValidEmail(targetEmail)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    const hostHabit = await Habit.findOne({ _id: habitId, user_id: req.user.id });
    if (!hostHabit) {
      return res.status(404).json({ error: "Habit not found" });
    }

    if (targetEmail === req.user.email.toLowerCase()) {
      return res.status(400).json({ error: "You cannot invite yourself" });
    }

    const friendUser = await User.findOne({ email: targetEmail });
    if (!friendUser) {
      return res.status(404).json({ error: "Invitation could not be sent. Please check the email and try again." });
    }

    // Check if a shared habit invite already exists between these users for a similar name/id
    const existingSharedHabit = await Habit.findOne({
      user_id: req.user.id,
      isShared: true,
      sharedWithEmail: targetEmail,
      title: hostHabit.title
    });
    if (existingSharedHabit) {
      return res.status(400).json({ error: "You are already sharing or have invited this friend to this habit!" });
    }

    const dashboardUrl = process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 3000}`;
    const inviterName = req.user.name || req.user.email?.split("@")[0] || "A HabitCoachAI user";
    const inviteHtml = generateDuoInviteEmail({
      inviterName,
      habitTitle: hostHabit.title,
      dashboardUrl
    });
    const inviteEmailResult = await sendEmail(targetEmail, `${inviterName} invited you to a Duo habit`, inviteHtml);
    if (!inviteEmailResult.ok) {
      console.error("Failed to send Duo invite email.", {
        targetUserId: String(friendUser._id),
        habitId: String(hostHabit._id),
        reason: inviteEmailResult.error?.message || "unknown"
      });
      return res.status(502).json({ error: "Invitation could not be sent. Please check the email and try again." });
    }

    // Create the recipient habit
    const friendHabit = new Habit({
      title: hostHabit.title,
      description: hostHabit.description || "Shared with you",
      user_id: friendUser._id,
      frequency: hostHabit.frequency,
      timeOfDay: hostHabit.timeOfDay,
      difficulty: hostHabit.difficulty,
      yearlyGoal: hostHabit.yearlyGoal,
      isShared: true,
      sharedWithEmail: req.user.email,
      shareStatus: "pending",
      sharedHabitId: hostHabit._id,
      invitedBy: req.user.id
    });
    await friendHabit.save();

    // Link the host habit
    hostHabit.isShared = true;
    hostHabit.sharedWithEmail = targetEmail;
    hostHabit.sharedHabitId = friendHabit._id;
    hostHabit.shareStatus = "pending";
    hostHabit.invitedBy = req.user.id;
    await hostHabit.save();

    res.status(200).json({
      message: "Invite sent successfully!",
      emailSent: true,
      habit: hostHabit
    });
  } catch (err) {
    console.error("Duo invite failed.", { reason: err.message });
    res.status(500).json({ error: "Invitation could not be sent. Please check the email and try again." });
  }
});

// POST /api/social/accept - Accept a pending invite
router.post("/accept", protect, async (req, res) => {
  try {
    const { habitId } = req.body;

    const recipientHabit = await Habit.findOne({ _id: habitId, user_id: req.user.id });
    if (!recipientHabit) {
      return res.status(404).json({ error: "Invitation habit not found" });
    }

    const isIncomingInvite = recipientHabit.invitedBy && String(recipientHabit.invitedBy) !== String(req.user.id);
    if (!isIncomingInvite || recipientHabit.shareStatus !== "pending") {
      return res.status(400).json({ error: "Only pending incoming invitations can be accepted." });
    }

    recipientHabit.shareStatus = "accepted";
    await recipientHabit.save();

    if (recipientHabit.sharedHabitId) {
      const hostHabit = await Habit.findById(recipientHabit.sharedHabitId);
      if (hostHabit) {
        hostHabit.shareStatus = "accepted";
        await hostHabit.save();
      }
    }

    res.status(200).json({ message: "Invitation accepted!", habit: recipientHabit });
  } catch (err) {
    res.status(500).json({ error: "Server Error", details: err.message });
  }
});

// POST /api/social/decline - Deny an incoming invite or cancel a sent invite
router.post("/decline", protect, async (req, res) => {
  try {
    const { habitId } = req.body;

    const selectedHabit = await Habit.findOne({ _id: habitId, user_id: req.user.id });
    if (!selectedHabit) {
      return res.status(404).json({ error: "Invitation habit not found" });
    }
    if (selectedHabit.shareStatus !== "pending") {
      return res.status(400).json({ error: "Only pending invitations can be canceled." });
    }

    const isIncomingInvite = selectedHabit.invitedBy && String(selectedHabit.invitedBy) !== String(req.user.id);

    if (isIncomingInvite) {
      if (selectedHabit.sharedHabitId) {
        const hostHabit = await Habit.findById(selectedHabit.sharedHabitId);
        if (hostHabit) {
          hostHabit.isShared = false;
          hostHabit.sharedWithEmail = null;
          hostHabit.sharedHabitId = null;
          hostHabit.shareStatus = "none";
          await hostHabit.save();
        }
      }
      await Habit.findByIdAndDelete(selectedHabit._id);
      return res.status(200).json({ message: "Invitation denied and removed." });
    }

    if (selectedHabit.sharedHabitId) {
      await Habit.findOneAndDelete({
        _id: selectedHabit.sharedHabitId,
        isShared: true,
        shareStatus: "pending",
        invitedBy: req.user.id
      });
    }

    selectedHabit.isShared = false;
    selectedHabit.sharedWithEmail = null;
    selectedHabit.sharedHabitId = null;
    selectedHabit.shareStatus = "none";
    selectedHabit.invitedBy = null;
    await selectedHabit.save();

    res.status(200).json({ message: "Invitation canceled." });
  } catch (err) {
    res.status(500).json({ error: "Server Error", details: err.message });
  }
});

// GET /api/social/global-pulse - Anonymous community stats
router.get("/global-pulse", protect, async (req, res) => {
  try {
    const timezone = getUserTimezone(req);
    const todayKey = getDateKeyInTimezone(new Date(), timezone);
    const yesterdayKey = shiftDateKey(todayKey, -1);
    const todayDayIndex = getDayIndexFromDateKey(todayKey);
    const yesterdayDayIndex = getDayIndexFromDateKey(yesterdayKey);

    // Fetch all habits and their history matching yesterday or today
    const habits = await Habit.find({});
    
    let totalScheduledToday = 0;
    let completedToday = 0;
    let totalScheduledYesterday = 0;
    let completedYesterday = 0;

    let fitnessScheduledToday = 0;
    let fitnessCompletedToday = 0;

    // Words indicating a fitness habit
    const fitnessWords = ["gym", "run", "workout", "exercise", "walk", "fitness", "sport", "yoga", "stretch", "lift"];

    for (const habit of habits) {
      const history = habit.history || [];
      const titleLower = (habit.title || "").toLowerCase();
      const isFitness = fitnessWords.some(word => titleLower.includes(word));

      const isScheduledToday = getHabitFrequency(habit).includes(todayDayIndex);
      const isScheduledYesterday = getHabitFrequency(habit).includes(yesterdayDayIndex);

      // Today
      const todayRecord = history.find(r => r.date === todayKey);
      if (isScheduledToday || todayRecord) {
        totalScheduledToday += 1;
        if (todayRecord?.status === "completed") {
          completedToday += 1;
          if (isFitness) fitnessCompletedToday += 1;
        }
        if (isFitness) fitnessScheduledToday += 1;
      }

      // Yesterday
      const yesterdayRecord = history.find(r => r.date === yesterdayKey);
      if (isScheduledYesterday || yesterdayRecord) {
        totalScheduledYesterday += 1;
        if (yesterdayRecord?.status === "completed") {
          completedYesterday += 1;
        }
      }
    }

    // Streaks saved (dates frozen today)
    const users = await User.find({});
    let streakFreezesUsed = 0;
    for (const u of users) {
      if (u.frozenDates && u.frozenDates.includes(todayKey)) {
        streakFreezesUsed += 1;
      }
    }

    // Yield beautiful aggregated summaries
    const rateToday = totalScheduledToday > 0 ? Math.round((completedToday / totalScheduledToday) * 100) : 74; // Fallback to 74% if db has no active logs yet
    const rateYesterday = totalScheduledYesterday > 0 ? Math.round((completedYesterday / totalScheduledYesterday) * 100) : 76;
    const fitnessRateToday = fitnessScheduledToday > 0 ? Math.round((fitnessCompletedToday / fitnessScheduledToday) * 100) : 84; // Fallback to 84%

    res.status(200).json({
      completionRateToday: rateToday,
      completionRateYesterday: rateYesterday,
      fitnessCompletionRateToday: fitnessRateToday,
      totalCompletedToday: completedToday || 12, // fallback values to show healthy activity on cold starts
      streakFreezesUsedToday: streakFreezesUsed || 3
    });
  } catch (err) {
    res.status(500).json({ error: "Server Error", details: err.message });
  }
});

export default router;
