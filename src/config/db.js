//src/config/db.js
import pkg from "pg";
import dotenv from "dotenv";


dotenv.config();
const { Pool } = pkg;

const statusPool = new Pool({
  user: process.env.STATUS_DB_USER,
  host: process.env.STATUS_DB_HOST,
  database: process.env.STATUS_DB_NAME,
  password: process.env.STATUS_DB_PASSWORD,
  port: process.env.STATUS_DB_PORT,
});

statusPool.on("connect", () => console.log("✅ Connected to status database"));
statusPool.on("error", (err) => console.error("❌ Status database connection error:", err));

export default statusPool;