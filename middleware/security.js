const isPlainObject = (value) =>
  Object.prototype.toString.call(value) === "[object Object]";

const sanitizeString = (value) =>
  value
    .replace(/<\s*script/gi, "&lt;script")
    .replace(/javascript\s*:/gi, "")
    .replace(/\son\w+\s*=/gi, "");

const sanitizeValue = (value) => {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (typeof value === "string") return sanitizeString(value);
  if (!isPlainObject(value)) return value;

  return Object.entries(value).reduce((safe, [key, nestedValue]) => {
    if (key.startsWith("$") || key.includes(".")) return safe;
    safe[key] = sanitizeValue(nestedValue);
    return safe;
  }, {});
};

export const sanitizeRequest = (req, res, next) => {
  req.body = sanitizeValue(req.body);
  req.params = sanitizeValue(req.params);

  try {
    req.query = sanitizeValue(req.query);
  } catch (error) {
    // Express may expose req.query through a getter depending on configuration.
  }

  next();
};

export const enforceHttps = (req, res, next) => {
  if (process.env.NODE_ENV !== "production") return next();
  if (req.path === "/health" || req.path === "/ready") return next();

  const forwardedProto = req.headers["x-forwarded-proto"];
  const isSecure = req.secure || forwardedProto === "https";

  if (isSecure) return next();

  return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
};

export const validateProductionEnv = () => {
  const required = ["MONGO_URI", "JWT_SECRET"];
  const missing = required.filter((key) => !process.env[key]);

  const warnings = [];
  const errors = [];

  if (missing.length > 0) {
    errors.push(`Missing required environment variables: ${missing.join(", ")}`);
  }

  if (process.env.NODE_ENV === "production") {
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
      errors.push("JWT_SECRET must be at least 32 characters in production.");
    }

    if (process.env.FRONTEND_URL && !process.env.FRONTEND_URL.startsWith("https://")) {
      warnings.push("FRONTEND_URL should use https:// in production. Request host fallback will be used for same-app links.");
    }

    if (!process.env.FRONTEND_URL) {
      warnings.push("FRONTEND_URL is not set. DigitalOcean request host fallback will be used for links and same-origin CORS.");
    }
  }

  return { ok: errors.length === 0, errors, warnings };
};
