import mongoose from "mongoose";

const dailyReviewSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "User",
    index: true
  },
  date: {
    type: String,
    required: true,
    index: true
  },
  wins: {
    type: String,
    trim: true,
    default: ""
  },
  blockers: {
    type: String,
    trim: true,
    default: ""
  },
  energyLevel: {
    type: String,
    enum: ["low", "medium", "high"],
    default: "medium"
  },
  tomorrowPriority: {
    type: String,
    trim: true,
    default: ""
  },
  summary: {
    type: String,
    trim: true,
    required: true
  },
  recommendations: {
    type: [String],
    default: []
  },
  motivationalNote: {
    type: String,
    trim: true,
    default: ""
  },
  suggestedTimeChanges: {
    type: [String],
    default: []
  }
}, {
  timestamps: true
});

dailyReviewSchema.index({ user_id: 1, date: 1 }, { unique: true });

const DailyReview = mongoose.model("DailyReview", dailyReviewSchema);

export default DailyReview;
