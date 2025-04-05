// src/config/jwt.js
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import db from "./db.js";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || "15m";
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || "7d";

export const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: ACCESS_EXPIRY }
  );
};

export const generateRefreshToken = async (user) => {
  try {
    const refreshToken = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET + "refresh",
      { expiresIn: REFRESH_EXPIRY }
    );

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await db.query(
      "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)",
      [user.id, refreshToken, expiresAt]
    );

    return refreshToken;
  } catch (error) {
    console.error("❌ Error generating refresh token:", error);
    throw new Error("Failed to generate refresh token");
  }
};

export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    console.error("❌ Access token verification failed:", error);
    throw new Error("Invalid or expired access token");
  }
};

export const verifyRefreshToken = async (token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET + "refresh");
    const { rows } = await db.query(
      "SELECT * FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()",
      [token]
    );
    if (rows.length === 0) {
      throw new Error("Invalid or expired refresh token");
    }
    return decoded;
  } catch (error) {
    console.error("❌ Refresh token verification failed:", error);
    throw new Error("Invalid or expired refresh token");
  }
};

export const revokeRefreshToken = async (token) => {
  try {
    await db.query("DELETE FROM refresh_tokens WHERE token = $1", [token]);
  } catch (error) {
    console.error("❌ Error revoking refresh token:", error);
    throw new Error("Failed to revoke refresh token");
  }
};