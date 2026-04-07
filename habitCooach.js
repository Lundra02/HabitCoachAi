import 'dotenv/config'; // 1. THIS MUST BE FIRST
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

import authRoute from "./routes/auth.js";
import habitsRoute from "./routes/habits.js";
import chatRoute from "./routes/chat.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || "*", 
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
app.use(express.json());

// Serve Static Frontend Files from the "public" directory securely
app.use(express.static(path.join(__dirname, "public")));

// Connect to DB
mongoose.connect(process.env.MONGO_URI, {})
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// API Routes
app.use("/api", authRoute);
app.use("/api/habits", habitsRoute);
app.use("/api/chat", chatRoute);

// Fallback Route (Serving Frontend on any unmatched routes)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("Environment Keys Check:", {
    "AI Key": process.env.AI_API_KEY ? "Found" : "MISSING",
    "MongoDB URI": process.env.MONGO_URI ? "Found" : "MISSING"
  });
});