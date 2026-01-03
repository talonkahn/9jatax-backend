import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true"
    ? { rejectUnauthorized: false }
    : false,
});

// 🔌 Log successful connection
pool.on("connect", () => {
  console.log("🟢 Postgres connected");
});

// ❌ Log unexpected errors
pool.on("error", (err) => {
  console.error("🔴 Postgres pool error:", err);
  process.exit(1);
});