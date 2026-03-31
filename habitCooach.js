import 'dotenv/config'; // 1. THIS MUST BE FIRST
import express from "express";
import askRoute from "./routes/ask.js";
import authRoute from "./routes/auth.js";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

// Connect to DB
mongoose.connect(process.env.MONGO_URI, {})
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));
app.use(express.static("public"));
app.use("/api", authRoute);
app.use("/ask", askRoute);

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
  // Add this to verify the key is actually there:
  console.log("Key Check:", process.env.GEMINI_API_KEY ? "Key Found" : "Key MISSING");
});