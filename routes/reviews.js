import express from "express";
import axios from "axios";
import { protect } from "../middleware/authMiddleware.js";
import Habit from "../models/Habit.js";
import DailyReview from "../models/DailyReview.js";

const router = express.Router();
const DEFAULT_TIMEZONE = "UTC";
const AI_TIMEOUT_MS = 15000;
const MAX_TEXT_LENGTH = 700;
const VALID_ENERGY_LEVELS = new Set(["low", "medium", "high"]);

const stripCodeFences = (text) => text.replace(/^```json\s*|^```\s*|```$/gim, "").trim();
const trimText = (value = "") => String(value).trim().replace(/\s+/g, " ");

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

const sanitizeInput = (value) => trimText(value).slice(0, MAX_TEXT_LENGTH);

const validateAiReviewPayload = (payload) => {
  if (!payload || typeof payload !== "object") {
    throw new Error("AI response was not a JSON object.");
  }

  const summary = trimText(payload.summary);
  const motivationalNote = trimText(payload.motivationalNote);
  const recommendations = Array.isArray(payload.recommendations)
    ? payload.recommendations.map((item) => trimText(item)).filter(Boolean).slice(0, 3)
    : [];
  const suggestedTimeChanges = Array.isArray(payload.suggestedTimeChanges)
    ? payload.suggestedTimeChanges.map((item) => trimText(item)).filter(Boolean).slice(0, 3)
    : [];

  if (!summary) {
    throw new Error("AI summary is missing.");
  }

  return {
    summary: summary.slice(0, 900),
    recommendations,
    motivationalNote: motivationalNote.slice(0, 500),
    suggestedTimeChanges
  };
};

const buildHabitContext = (habits) => habits.slice(0, 12).map((habit) => {
  const history = Array.isArray(habit.history) ? habit.history : [];
  const completed = history.filter((entry) => entry?.status === "completed").length;
  const missed = history.filter((entry) => entry?.status === "missed").length;

  return {
    title: habit.title,
    status: habit.status,
    timeOfDay: habit.timeOfDay,
    difficulty: habit.difficulty || "medium",
    completed,
    missed
  };
});

const requestAiDailyReview = async ({ apiKey, reviewInput, habits }) => {
  const response = await axios.post(
    "https://api.llmapi.ai/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: [
            "You are HabitCoachAI, a concise premium productivity coach.",
            "Return ONLY valid JSON, no markdown, no extra text.",
            "JSON schema:",
            '{"summary":"string","recommendations":["string","string","string"],"motivationalNote":"string","suggestedTimeChanges":["string"]}',
            "Rules:",
            "- summary should be specific and under 90 words",
            "- recommendations must be practical tomorrow actions",
            "- suggestedTimeChanges should mention habit timing changes only when useful",
            "- tone should be clear, warm, and direct"
          ].join("\n")
        },
        {
          role: "user",
          content: JSON.stringify({
            dailyCheckIn: reviewInput,
            habits: buildHabitContext(habits)
          })
        }
      ],
      temperature: 0.35
    },
    {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      timeout: AI_TIMEOUT_MS
    }
  );

  const aiText = response?.data?.choices?.[0]?.message?.content;
  if (!aiText || typeof aiText !== "string") {
    throw new Error("AI returned empty content.");
  }

  return validateAiReviewPayload(JSON.parse(stripCodeFences(aiText)));
};

router.get("/today", protect, async (req, res) => {
  try {
    const timezone = getUserTimezone(req);
    const todayKey = getDateKeyInTimezone(new Date(), timezone);
    const review = await DailyReview.findOne({ user_id: req.user.id, date: todayKey }).lean();

    res.status(200).json({ review });
  } catch (error) {
    res.status(500).json({ error: "Failed to load daily review.", details: error.message });
  }
});

router.post("/", protect, async (req, res) => {
  try {
    const timezone = getUserTimezone(req);
    const todayKey = getDateKeyInTimezone(new Date(), timezone);
    const energyLevel = VALID_ENERGY_LEVELS.has(req.body.energyLevel) ? req.body.energyLevel : "medium";
    const reviewInput = {
      wins: sanitizeInput(req.body.wins),
      blockers: sanitizeInput(req.body.blockers),
      energyLevel,
      tomorrowPriority: sanitizeInput(req.body.tomorrowPriority)
    };

    if (!reviewInput.wins && !reviewInput.blockers && !reviewInput.tomorrowPriority) {
      return res.status(400).json({ error: "Add at least one reflection detail before generating a review." });
    }

    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server AI configuration error." });
    }

    const habits = await Habit.find({ user_id: req.user.id }).sort("-createdAt").lean();
    const aiReview = await requestAiDailyReview({ apiKey, reviewInput, habits });

    const review = await DailyReview.findOneAndUpdate(
      { user_id: req.user.id, date: todayKey },
      {
        ...reviewInput,
        ...aiReview,
        user_id: req.user.id,
        date: todayKey
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true
      }
    ).lean();

    res.status(200).json({ review });
  } catch (error) {
    if (error.response) {
      console.error(`[Daily Review API] LLM Provider Error - Status: ${error.response.status}`);
      return res.status(502).json({ error: "AI provider error. Please try again later." });
    }
    if (error.code === "ECONNABORTED") {
      return res.status(504).json({ error: "AI request timed out. Please try again." });
    }

    console.error("[Daily Review API] Internal Server Error:", error.message);
    res.status(500).json({ error: "Failed to generate daily review." });
  }
});

export default router;
