import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");

const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

  if (!req.path.startsWith("/api/") && req.accepts("html")) {
    return res.status(statusCode).sendFile(path.join(publicDir, "error.html"));
  }

  res.status(statusCode).json({
    error: statusCode >= 500 ? "Internal Server Error" : (err.message || "Request failed")
  });
};

export default errorHandler;
