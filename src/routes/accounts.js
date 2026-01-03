import express from "express";
import { pool } from "../db/index.js";
import { requireCompany } from "../middleware/requireCompany.js";

const router = express.Router();

/* =====================
   DEFAULT CHART OF ACCOUNTS
===================== */
const DEFAULT_ACCOUNTS = [
  // Assets
  { code: 1000, name: "Cash", type: "asset" },
  { code: 1100, name: "Accounts Receivable", type: "asset" },

  // Liabilities
  { code: 2100, name: "VAT Payable", type: "liability" },

  // Income
  { code: 4000, name: "Sales Revenue", type: "income" },

  // Expenses
  { code: 5100, name: "Operating Expenses", type: "expense" },
  { code: 5200, name: "Utilities Expense", type: "expense" },
  { code: 5300, name: "Transport Expense", type: "expense" },
];

/* =====================
   INIT DEFAULT ACCOUNTS (ONCE PER COMPANY)
===================== */
router.post("/init", requireCompany, async (req, res) => {
  const companyId = req.user.companyId;

  try {
    const existing = await pool.query(
      `SELECT 1 FROM accounts WHERE company_id = $1 LIMIT 1`,
      [companyId]
    );

    if (existing.rowCount > 0) {
      return res.json({ success: true, message: "Accounts already exist" });
    }

    const values = [];
    const placeholders = DEFAULT_ACCOUNTS.map((a, i) => {
      const base = i * 4;
      values.push(companyId, a.code, a.name, a.type);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
    });

    await pool.query(
      `
      INSERT INTO accounts (company_id, code, name, account_type)
      VALUES ${placeholders.join(",")}
      `,
      values
    );

    res.json({ success: true });
  } catch (err) {
    console.error("INIT ACCOUNTS ERROR:", err.message);
    res.status(500).json({ error: "Failed to initialize accounts" });
  }
});

/* =====================
   CREATE CUSTOM ACCOUNT
===================== */
router.post("/", requireCompany, async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const { code, name, account_type } = req.body;

    if (!code || !name || !account_type) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO accounts (company_id, code, name, account_type)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [companyId, code, name, account_type]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("CREATE ACCOUNT ERROR:", err.message);
    res.status(500).json({ error: "Failed to create account" });
  }
});

/* =====================
   LIST COMPANY ACCOUNTS
===================== */
router.get("/company", requireCompany, async (req, res) => {
  try {
    const companyId = req.user.companyId;

    const { rows } = await pool.query(
      `
      SELECT *
      FROM accounts
      WHERE company_id = $1
      ORDER BY code
      `,
      [companyId]
    );

    res.json(rows);
  } catch (err) {
    console.error("FETCH ACCOUNTS ERROR:", err.message);
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

export default router;