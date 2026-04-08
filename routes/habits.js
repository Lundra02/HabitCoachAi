import express from "express";
import Habit from "../models/Habit.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Get all habits for the logged-in user
router.get("/", protect, async (req, res) => {
  try {
    const habits = await Habit.find({ user_id: req.user.id }).sort("-createdAt");
    res.status(200).json(habits);
  } catch (err) {
    res.status(500).json({ error: "Server Error", details: err.message });
  }
});

// Create a new habit
router.post("/", protect, async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Please add a valid title" });
    }

    if (title.trim().length > 100) {
      return res.status(400).json({ error: "Title exceeds maximum length of 100 characters." });
    }

    if (description && (typeof description !== "string" || description.trim().length > 500)) {
      return res.status(400).json({ error: "Description exceeds maximum length of 500 characters." });
    }

    const habit = await Habit.create({
      title,
      description,
      user_id: req.user.id
    });

    res.status(201).json(habit);
  } catch (err) {
    res.status(500).json({ error: "Server Error", details: err.message });
  }
});

// Update a habit
router.put("/:id", protect, async (req, res) => {
  try {
    const habit = await Habit.findById(req.params.id);

    if (!habit) {
      return res.status(404).json({ error: "Habit not found" });
    }

    // Check for user ownership
    if (habit.user_id.toString() !== req.user.id) {
      return res.status(401).json({ error: "User not authorized to update this habit" });
    }

    const { title, description, status } = req.body;
    if (title !== undefined && (typeof title !== "string" || !title.trim() || title.trim().length > 100)) {
      return res.status(400).json({ error: "Invalid title. Must be between 1 and 100 characters." });
    }
    if (description !== undefined && (typeof description !== "string" || description.trim().length > 500)) {
      return res.status(400).json({ error: "Description exceeds maximum length." });
    }

    const updatedHabit = await Habit.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.status(200).json(updatedHabit);
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

    // Check for user ownership
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
