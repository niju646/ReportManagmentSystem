// src/middleware/auth.js
import { verifyAccessToken } from "../config/jwt.js";

export const authenticate = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    console.warn("⚠️ No token provided in request");
    return res.status(401).json({
      success: false,
      error: "Access denied: No token provided",
    });
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    if (!["admin", "teacher"].includes(decoded.role)) {
      console.warn(`⚠️ User ${decoded.id} with role ${decoded.role} attempted to access protected route`);
      return res.status(403).json({
        success: false,
        error: "Access denied: Insufficient permissions",
      });
    }
    console.log(`✅ User ${decoded.id} (${decoded.role}) authenticated successfully`);
    next();
  } catch (error) {
    console.error("❌ Authentication failed:", error.message);
    res.status(401).json({
      success: false,
      error: error.message,
    });
  }
};