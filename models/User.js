import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationCode: String,
  verificationCodeExpires: Date,
  verificationToken: String,
  verificationExpires: Date,
  resetToken: String,
  resetExpires: Date,
  failedLoginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },
  provider: {
    type: String,
    default: null
  },
  providerId: {
    type: String,
    default: null
  },
  avatarUrl: {
    type: String,
    default: null
  },
  timezone: {
    type: String,
    default: "UTC"
  },
  xp: {
    type: Number,
    default: 0
  },
  level: {
    type: Number,
    default: 1
  },
  streakFreezes: {
    type: Number,
    default: 0
  },
  frozenDates: {
    type: [String],
    default: []
  },
  badges: {
    type: [String],
    default: []
  },
  settings: {
    aiCoach: {
      coachingStyle: {
        type: String,
        enum: ["gentle", "balanced", "strict"],
        default: "balanced"
      },
      focusAreas: {
        type: [String],
        default: ["productivity"]
      },
      dailyCheckInTime: {
        type: String,
        default: "18:00"
      },
      recommendationIntensity: {
        type: String,
        enum: ["light", "normal", "aggressive"],
        default: "normal"
      }
    },
    notifications: {
      morningBriefing: {
        type: Boolean,
        default: true
      },
      eveningReview: {
        type: Boolean,
        default: true
      },
      missedHabitReminders: {
        type: Boolean,
        default: true
      },
      weeklyProgressReport: {
        type: Boolean,
        default: true
      }
    },
    habitDefaults: {
      difficulty: {
        type: String,
        enum: ["easy", "medium", "hard"],
        default: "medium"
      },
      timeOfDay: {
        type: String,
        enum: ["Morning", "Afternoon", "Evening"],
        default: "Morning"
      },
      frequencyPreset: {
        type: String,
        enum: ["everyday", "weekdays", "custom"],
        default: "everyday"
      },
      customFrequency: {
        type: [Number],
        default: [1, 2, 3, 4, 5]
      }
    },
    dashboard: {
      startPage: {
        type: String,
        enum: ["dashboard", "planning", "progress", "social"],
        default: "dashboard"
      },
      showDailyReview: {
        type: Boolean,
        default: true
      },
      showEnergyMatch: {
        type: Boolean,
        default: true
      },
      compactMode: {
        type: Boolean,
        default: false
      },
      theme: {
        type: String,
        enum: ["light", "obsidian", "nord", "sepia"],
        default: "light"
      }
    }
  }
}, {
  timestamps: true,
});

userSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.index({ resetToken: 1 }, { sparse: true });
userSchema.index({ verificationCode: 1 }, { sparse: true });
userSchema.index({ lockUntil: 1 }, { sparse: true });

const User = mongoose.model("User", userSchema);

export default User;
