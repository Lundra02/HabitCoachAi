import fs from "fs";
import path from "path";

const root = process.cwd();

const expectedFiles = [
  "habitCoach.js",
  "middleware/authMiddleware.js",
  "middleware/errorHandler.js",
  "models/DailyReview.js",
  "models/Habit.js",
  "models/User.js",
  "public/reset-password.js",
  "public/script.js",
  "public/sw.js",
  "public/verify.js",
  "routes/auth.js",
  "routes/chat.js",
  "routes/habits.js",
  "routes/progress.js",
  "routes/reviews.js",
  "routes/settings.js",
  "routes/social.js",
  "scripts/email-test.js",
  "utils/emailHelper.js",
  "utils/emailTemplates.js"
];

const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

for (const file of expectedFiles) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) {
    fail(`Missing expected file: ${file}`);
  }
}

const cssPath = path.join(root, "public/style.css");
const css = fs.readFileSync(cssPath, "utf8");
let braceDepth = 0;
for (const char of css) {
  if (char === "{") braceDepth += 1;
  if (char === "}") braceDepth -= 1;
  if (braceDepth < 0) {
    fail("CSS brace check failed: found an extra closing brace in public/style.css");
    break;
  }
}
if (braceDepth !== 0) {
  fail(`CSS brace check failed: brace depth ended at ${braceDepth}`);
}

const htmlFiles = fs
  .readdirSync(path.join(root, "public"))
  .filter((file) => file.endsWith(".html"))
  .map((file) => path.join("public", file));

for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  const hasInlineScript = /<script\b(?![^>]*\bsrc=)[^>]*>/i.test(html);
  if (hasInlineScript) {
    fail(`CSP check failed: inline script found in ${file}`);
  }
}

if (!process.exitCode) {
  console.log("Build checks passed.");
}
