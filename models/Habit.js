import mongoose from "mongoose";

const habitHistorySchema = new mongoose.Schema({
  date: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ["pending", "completed", "missed"],
    default: "pending"
  },
  locked: {
    type: Boolean,
    default: false
  }
}, { _id: false });

const habitSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "Please add a habit title"],
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ["pending", "completed", "missed"],
    default: "pending",
  },
  completed: {
    type: Boolean,
    default: false,
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "User",
  },
  frequency: {
    type: [Number],
    default: [0, 1, 2, 3, 4, 5, 6],
    validate: {
      validator: (days) =>
        Array.isArray(days) &&
        days.length > 0 &&
        days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6),
      message: "Frequency must be an array of day numbers between 0 and 6."
    }
  },
  timeOfDay: {
    type: String,
    enum: ["Morning", "Afternoon", "Evening"],
    default: "Morning"
  },
  yearlyGoal: {
    type: Number,
    default: 365,
    min: [1, "Yearly goal must be at least 1."],
    max: [366, "Yearly goal cannot exceed 366."]
  },
  history: {
    type: [habitHistorySchema],
    default: []
  }
}, {
  timestamps: true
});

const Habit = mongoose.model("Habit", habitSchema);

export default Habit;
