import express from "express";
import axios from "axios";
import { protect } from "../middleware/authMiddleware.js";
import Habit from "../models/Habit.js";
import { buildHabitGenerationMessages } from "../utils/aiPrompts.js";

const router = express.Router();
const MAX_PROMPT_LENGTH = 300;
const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const AI_TIMEOUT_MS = 15000;
const AI_MAX_ATTEMPTS = 2;
const DEFAULT_TIMEZONE = "UTC";

const normalizeTitle = (value) => value.trim().replace(/\s+/g, " ").toLowerCase();
const trimText = (value) => value.trim().replace(/\s+/g, " ");
const stripCodeFences = (text) => text.replace(/^```json\s*|^```\s*|```$/gim, "").trim();
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

const validateAiPayload = (payload, existingTitleSet) => {
  if (!payload || typeof payload !== "object") {
    throw new Error("AI response was not a JSON object.");
  }

  if (typeof payload.reply !== "string" || !payload.reply.trim()) {
    throw new Error("AI reply is missing.");
  }

  if (!Array.isArray(payload.habits) || payload.habits.length !== 3) {
    throw new Error("AI must return exactly 3 habits.");
  }

  const uniqueTitles = new Set();
  const cleanHabits = payload.habits.map((habit, index) => {
    if (!habit || typeof habit !== "object") {
      throw new Error(`Habit ${index + 1} is invalid.`);
    }

    if (typeof habit.title !== "string" || !habit.title.trim()) {
      throw new Error(`Habit ${index + 1} title is invalid.`);
    }

    const cleanTitle = trimText(habit.title);
    if (cleanTitle.length > MAX_TITLE_LENGTH) {
      throw new Error(`Habit ${index + 1} title is too long.`);
    }

    const normalized = normalizeTitle(cleanTitle);
    if (uniqueTitles.has(normalized)) {
      throw new Error("AI returned duplicate titles.");
    }
    if (existingTitleSet.has(normalized)) {
      throw new Error("AI returned an existing habit title.");
    }
    uniqueTitles.add(normalized);

    let cleanDescription = "";
    if (typeof habit.description === "string") {
      cleanDescription = habit.description.trim();
    }
    if (cleanDescription.length > MAX_DESCRIPTION_LENGTH) {
      cleanDescription = cleanDescription.slice(0, MAX_DESCRIPTION_LENGTH);
    }

    return {
      title: cleanTitle,
      description: cleanDescription
    };
  });

  return {
    reply: payload.reply.trim(),
    habits: cleanHabits
  };
};

const requestAiHabitPayload = async ({ prompt, existingHabitTitles, apiKey }) => {
  const messages = buildHabitGenerationMessages({
    userPrompt: prompt,
    existingHabitTitles
  });

  const response = await axios.post(
    "https://api.llmapi.ai/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages,
      temperature: 0.4
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

  const parsed = JSON.parse(stripCodeFences(aiText));
  return parsed;
};

router.post("/", protect, async (req, res) => {
  try {
    const timezone = getUserTimezone(req);
    const todayKey = getDateKeyInTimezone(new Date(), timezone);
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "A valid prompt is required." });
    }

    const cleanPrompt = prompt.trim();
    if (cleanPrompt.length > MAX_PROMPT_LENGTH) {
      return res.status(400).json({ error: `Prompt exceeds the maximum length of ${MAX_PROMPT_LENGTH} characters.` });
    }

    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
      console.error("[Chat API] Missing AI_API_KEY in environment.");
      return res.status(500).json({ error: "Server AI configuration error." });
    }

    const existingHabits = await Habit.find({ user_id: req.user.id }).select("title -_id");
    const existingTitles = existingHabits.map((habit) => habit.title);
    const existingTitleSet = new Set(existingTitles.map((title) => normalizeTitle(title)));

    let aiPayload = null;
    let lastValidationError = "AI failed to return valid habits.";

    for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt += 1) {
      try {
        const rawPayload = await requestAiHabitPayload({
          prompt: cleanPrompt,
          existingHabitTitles: existingTitles,
          apiKey
        });

        aiPayload = validateAiPayload(rawPayload, existingTitleSet);
        break;
      } catch (validationErr) {
        lastValidationError = validationErr.message;
      }
    }

    if (!aiPayload) {
      return res.status(502).json({
        error: `AI generation failed: ${lastValidationError}`
      });
    }

    // Double-check duplicates against database right before insert.
    for (const habit of aiPayload.habits) {
      const duplicate = await Habit.findOne({
        user_id: req.user.id,
        title: { $regex: `^${habit.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" }
      }).select("_id");

      if (duplicate) {
        return res.status(409).json({
          error: "Generated habits conflict with existing habits. Please try again."
        });
      }
    }

    const savedHabits = await Habit.insertMany(
      aiPayload.habits.map((habit) => ({
        title: habit.title,
        description: habit.description,
        status: "pending",
        completed: false,
        user_id: req.user.id,
        history: [{
          date: todayKey,
          status: "pending",
          locked: false
        }]
      }))
    );

    res.status(200).json({
      response: aiPayload.reply,
      habits: savedHabits
    });

  } catch (error) {
    if (error.response) {
      // Axios error response (avoid logging full sensitive payloads in prod)
      console.error(`[Chat API] LLM Provider Error - Status: ${error.response.status}`);
      return res.status(502).json({
        error: "AI provider error. Please try again later."
      });
    } else if (error.code === 'ECONNABORTED') {
      console.error("[Chat API] Timeout waiting for LLM Provider.");
      return res.status(504).json({ error: "AI request timed out. Please try again." });
    }

    // General fallback error
    console.error("[Chat API] Internal Server Error:", error.message);
    res.status(500).json({
      error: "An unexpected server error occurred."
    });
  }
});

export default router;
