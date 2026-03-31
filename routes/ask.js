import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Initialize Gemini with your new key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Update this line in routes/ask.js
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash-lite" // This has a much higher daily limit than standard Flash
});
router.post("/", protect, async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "No prompt provided" });
    }

    // Combine your rules with the user prompt
    const systemInstruction = `
    You are an AI Habit Coach for adults aged 18–35.
    Rules:
    1. Practical, actionable daily steps only.
    2. Brief explanations for why it works.
    3. Encouraging but firm tone.
    4. Ask ONE follow-up question.
    5. Use bullet points and bold headings.
    6. Max 150 words.
    7. End with a "Today's Action" summary.
    `;

    const result = await model.generateContent(`${systemInstruction}\n\nUser Question: ${prompt}`);
    const responseText = result.response.text();

    res.json({
      response: responseText
    });

  } catch (error) {
    console.error("GEMINI ERROR:", error.message);
    res.status(500).json({
      error: "Gemini AI failed",
      details: error.message
    });
  }
});

export default router;