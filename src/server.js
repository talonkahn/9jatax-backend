import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import companyRoutes from "./routes/companies.js";
import accountRoutes from "./routes/accounts.js";
import invoiceRoutes from "./routes/invoices.js";
import ledgerRoutes from "./routes/ledger.js";
import reportRoutes from "./routes/reports.js";
import expenseRoutes from "./routes/expenses.js";
import incomeRoutes from "./routes/income.js";
import exportRoutes from "./routes/exports.js";
import companyTaxRoutes from "./routes/companytax.js"; // ✅ added this
import usersRoutes from "./routes/users.js";
import preferencesRoutes from "./routes/preferences.js";
import { pool } from "./db/index.js";

dotenv.config();

const app = express();

/* =====================
   GLOBAL MIDDLEWARE
===================== */
app.use(cors());
app.use(express.json());

/* =====================
   DB CONNECTION CHECK
===================== */
(async () => {
  try {
    const res = await pool.query("SELECT current_database()");
    console.log("🟢 Connected to Postgres DB:", res.rows[0].current_database);
  } catch (err) {
    console.error("🔴 Postgres connection FAILED:", err.message);
    process.exit(1);
  }
})();

/* =====================
   HEALTH CHECK
===================== */
app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "9jatax-backend",
    status: "running",
  });
});

/* =====================
   ROUTES
===================== */
app.use("/api/auth", authRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/ledger", ledgerRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/income", incomeRoutes);
app.use("/api/exports", exportRoutes);
app.use("/api/company-tax", companyTaxRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/preferences", preferencesRoutes);

/* =====================
   SERVER
===================== */
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});