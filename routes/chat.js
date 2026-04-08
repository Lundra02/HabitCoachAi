import express from "express";
import axios from "axios";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", protect, async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "A valid prompt is required." });
    }

    if (prompt.trim().length > 300) {
      return res.status(400).json({ error: "Prompt exceeds the maximum length of 300 characters." });
    }

    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
      console.error("[Chat API] Missing AI_API_KEY in environment.");
      return res.status(500).json({ error: "Server AI configuration error." });
    }

    // Call llmapi.ai chat completions endpoint using axios with a timeout
    const response = await axios.post(
      "https://api.llmapi.ai/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "user", content: prompt }
        ]
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        timeout: 10000 // 10 second timeout
      }
    );

    // Safely access the deeply nested response
    const aiMessageContent = response?.data?.choices?.[0]?.message?.content;
    
    if (!aiMessageContent) {
      console.error("[Chat API] Invalid or empty structure received from LLM Provider.");
      return res.status(502).json({ error: "Received malformed response from AI provider." });
    }

    res.status(200).json({
      response: aiMessageContent
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
