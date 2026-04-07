import 'dotenv/config'; // 1. THIS MUST BE FIRST
import express from "express";
import cors from "cors";
import authRoute from "./routes/auth.js";
import habitsRoute from "./routes/habits.js";
import chatRoute from "./routes/chat.js";
import mongoose from "mongoose";

const app = express();
app.use(cors({
  origin: process.env.FRONTEND_URL || "*", // Fallback to all origins if not set
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
app.use(express.json());

// Connect to DB
mongoose.connect(process.env.MONGO_URI, {})
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));
app.use(express.static("public"));
app.use("/api", authRoute);
app.use("/api/habits", habitsRoute);
app.use("/api/chat", chatRoute);

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
  // Add this to verify the key is actually there:
  console.log("Key Check:", process.env.AI_API_KEY ? "Key Found" : "Key MISSING");
});