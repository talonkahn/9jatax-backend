import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.js";
import companyRoutes from "./routes/companies.js";
import accountRoutes from "./routes/accounts.js";
import invoiceRoutes from "./routes/invoices.js";
import ledgerRoutes from "./routes/ledger.js";
import reportRoutes from "./routes/reports.js";
import expenseRoutes from "./routes/expenses.js";
import incomeRoutes from "./routes/income.js";
import exportRoutes from "./routes/exports.js";
import companyTaxRoutes from "./routes/companytax.js";
import usersRoutes from "./routes/users.js";
import preferencesRoutes from "./routes/preferences.js";

import { supabase } from "./db/index.js"; // now dotenv is already loaded

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ ok: true, service: "9jatax-backend" });
});

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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});