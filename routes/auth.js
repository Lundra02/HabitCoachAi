import express from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import User from "../models/User.js";
import { sendEmail } from "../utils/emailHelper.js";
import { generateVerificationEmail, generateResetEmail } from "../utils/emailTemplates.js";

const router = express.Router();
const VERIFICATION_CODE_MINUTES = 10;
const RESET_TOKEN_BYTES = 32;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const resendVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many verification code requests. Please wait before trying again." }
});

// Funksion ndihmës për të gjenruar JWT
const generateToken = (userOrId) => {
  const isUserDocument = userOrId && typeof userOrId === "object" && userOrId._id;
  const payload = isUserDocument
    ? { id: userOrId._id, name: userOrId.name, email: userOrId.email }
    : { id: userOrId };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

const normalizeEmail = (email = "") => String(email).trim().toLowerCase();
const isValidEmail = (email) => EMAIL_PATTERN.test(email);
const isValidPassword = (password) => typeof password === "string" && password.length >= 6 && password.length <= 128;

const getPublicAppUrl = (req) => {
  const fallback = process.env.NODE_ENV === "production"
    ? ""
    : `http://localhost:${process.env.PORT || 3000}`;
  const configuredUrl = process.env.FRONTEND_URL || process.env.APP_URL || process.env.PUBLIC_URL || "";
  const requestHost = req?.get?.("host");
  const requestProto = req?.get?.("x-forwarded-proto") || req?.protocol || "https";
  const requestUrl = requestHost ? `${String(requestProto).split(",")[0].trim()}://${requestHost}` : "";
  const rawUrl = (configuredUrl || requestUrl || fallback).split(",")[0].trim().replace(/\/$/, "");

  try {
    const url = new URL(rawUrl);
    return url.toString().replace(/\/$/, "");
  } catch (error) {
    return fallback;
  }
};

const generateSixDigitCode = () => crypto.randomInt(100000, 1000000).toString();

const hashVerificationCode = (code, userId) => {
  const pepper = process.env.JWT_SECRET || "habitcoach-verification";
  return crypto
    .createHash("sha256")
    .update(`${code}:${userId}:${pepper}`)
    .digest("hex");
};

const storeVerificationCode = async (user) => {
  const code = generateSixDigitCode();
  user.verificationCode = hashVerificationCode(code, user._id);
  user.verificationCodeExpires = new Date(Date.now() + VERIFICATION_CODE_MINUTES * 60 * 1000);
  // Clear the old token-link fields so the code flow is the source of truth.
  user.verificationToken = undefined;
  user.verificationExpires = undefined;
  await user.save();
  return code;
};

const sendVerificationCode = async (user, req) => {
  const code = await storeVerificationCode(user);
  const dashboardUrl = getPublicAppUrl(req);
  const html = generateVerificationEmail({
    name: user.name,
    code,
    expiresMinutes: VERIFICATION_CODE_MINUTES,
    dashboardUrl
  });
  return await sendEmail(user.email, "Your HabitCoachAI verification code", html);
};

const authResponse = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  token: generateToken(user),
  xp: user.xp,
  level: user.level,
  streakFreezes: user.streakFreezes,
  frozenDates: user.frozenDates,
  badges: user.badges
});

// @desc    Register a new user
// @route   POST /api/register
// @access  Public
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  const normalizedEmail = normalizeEmail(email);

  try {
    if (!name || !normalizedEmail || !password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({ error: "Password must be 6-128 characters." });
    }

    const userExists = await User.findOne({ email: normalizedEmail });

    if (userExists) {
      return res.status(400).json({ error: "User already exists" });
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      isVerified: false
    });

    if (user) {
      let emailSent = false;
      try {
        const emailResult = await sendVerificationCode(user, req);
        emailSent = emailResult.ok;
        if (!emailResult.ok) {
          console.error(`Failed to send verification email to ${user.email}:`, emailResult.error?.message || emailResult.error);
        }
      } catch (e) {
        console.error("Failed to send verification email", e.message);
      }

      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        requiresVerification: true,
        emailSent,
        verificationCodeExpires: user.verificationCodeExpires
      });
    } else {
      res.status(400).json({ error: "Invalid user data" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server Error" });
  }
});

router.post("/verify-email", async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const code = String(req.body.code || "").trim();

  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: "Enter the 6-digit verification code." });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid verification request." });

    if (user.isVerified) {
      return res.json({
        message: "Email is already verified.",
        user: authResponse(user)
      });
    }

    if (!user.verificationCode || !user.verificationCodeExpires) {
      return res.status(400).json({ error: "No active verification code. Please request a new one." });
    }

    if (user.verificationCodeExpires.getTime() < Date.now()) {
      return res.status(400).json({ error: "Verification code expired. Please request a new code.", expired: true });
    }

    const incomingHash = hashVerificationCode(code, user._id);
    if (incomingHash !== user.verificationCode) {
      return res.status(400).json({ error: "Invalid verification code." });
    }

    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpires = undefined;
    user.verificationToken = undefined;
    user.verificationExpires = undefined;
    await user.save();

    res.json({
      message: "Email verified successfully.",
      user: authResponse(user)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/resend-verification", resendVerificationLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!isValidEmail(email)) return res.status(400).json({ error: "Please enter a valid email address." });

  try {
    const user = await User.findOne({ email });

    // Keep the response generic enough that this endpoint cannot enumerate users.
    if (!user) {
      return res.json({ message: "If the account exists, a new verification code was sent." });
    }

    if (user.isVerified) {
      return res.json({ message: "Email is already verified.", alreadyVerified: true });
    }

    const emailResult = await sendVerificationCode(user, req);
    if (!emailResult.ok) {
      console.error(`Failed to resend verification email to ${user.email}:`, emailResult.error?.message || emailResult.error);
      return res.status(500).json({ error: "Could not send verification email. Check SMTP configuration." });
    }

    res.json({
      message: "A new verification code was sent.",
      verificationCodeExpires: user.verificationCodeExpires
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


// Verify account via token
// GET /api/verify?token=<token>
router.get("/verify", async (req, res) => {
  const { token } = req.query;
  if (!token || typeof token !== "string" || token.length > 200) {
    return res.status(400).sendFile("error.html", { root: "public" });
  }

  try {
    const hashed = crypto.createHash("sha256").update(String(token)).digest("hex");
    const user = await User.findOne({ verificationToken: hashed, verificationExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).sendFile("error.html", { root: "public" });

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationExpires = undefined;
    user.verificationCode = undefined;
    user.verificationCodeExpires = undefined;
    await user.save();

    res.redirect(303, "/login.html");
  } catch (err) {
    console.error(err);
    res.status(500).sendFile("error.html", { root: "public" });
  }
});

// Forgot password - request reset
router.post("/forgot", async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!isValidEmail(email)) return res.status(400).json({ error: "Please enter a valid email address." });

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(200).json({ message: "If that email exists, a reset link was sent" });

    const resetRaw = crypto.randomBytes(RESET_TOKEN_BYTES).toString("hex");
    const resetHash = crypto.createHash("sha256").update(resetRaw).digest("hex");
    user.resetToken = resetHash;
    user.resetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save();

    const dashboardUrl = getPublicAppUrl(req);
    const html = generateResetEmail({ name: user.name, token: resetRaw, dashboardUrl });
    const emailResult = await sendEmail(user.email, "Reset your HabitCoach password", html);
    if (!emailResult.ok) {
      console.error(`Failed to send password reset email to ${user.email}:`, emailResult.error?.message || emailResult.error);
    }

    res.json({ message: "If that email exists, a reset link was sent" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Reset password
router.post("/reset", async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: "Token and new password are required" });

  if (typeof token !== "string" || token.length > RESET_TOKEN_BYTES * 2) {
    return res.status(400).json({ error: "Invalid or expired token" });
  }

  if (!isValidPassword(password)) {
    return res.status(400).json({ error: "Password must be 6-128 characters." });
  }

  try {
    const hashed = crypto.createHash("sha256").update(String(token)).digest("hex");
    const user = await User.findOne({ resetToken: hashed, resetExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ error: "Invalid or expired token" });

    user.password = password;
    user.resetToken = undefined;
    user.resetExpires = undefined;
    await user.save();

    res.json({ message: "Password has been reset" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// @desc    Auth user & get token
// @route   POST /api/login
// @access  Public
router.post("/login", async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;

  if (!isValidEmail(email) || typeof password !== "string") {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  try {
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      if (!user.isVerified) {
        let emailSent = false;
        const emailResult = await sendVerificationCode(user, req);
        emailSent = emailResult.ok;
        if (!emailResult.ok) {
          console.error(`Failed to send verification email to ${user.email}:`, emailResult.error?.message || emailResult.error);
        }

        return res.status(403).json({
          error: "Please verify your email before logging in.",
          requiresVerification: true,
          email: user.email,
          emailSent,
          verificationCodeExpires: user.verificationCodeExpires
        });
      }

      res.json(authResponse(user));
    } else {
      res.status(401).json({ error: "Invalid email or password" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server Error" });
  }
});

export default router;
