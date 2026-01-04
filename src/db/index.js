import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is missing");
  process.exit(1);
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
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