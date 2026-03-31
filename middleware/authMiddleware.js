import jwt from "jsonwebtoken";
import User from "../models/User.js";

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      // Marrja e token-it nga "Bearer <token>"
      token = req.headers.authorization.split(" ")[1];

      // Verifikimi i token-it
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Kërkimi i përdoruesit në DB (pa marrë passwordin) dhe ngjitja te request
      req.user = await User.findById(decoded.id).select("-password");

      next();
    } catch (error) {
      console.error(error);
      res.status(401).json({ error: "Not authorized, token failed" });
    }
  }

  if (!token) {
    res.status(401).json({ error: "Not authorized, no token" });
  }
};

export { protect };
