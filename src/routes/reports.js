import express from "express";
import { pool } from "../db/index.js";
import { requireCompany } from "../middleware/requireCompany.js";

const router = express.Router();

/* =====================
   DASHBOARD TOTALS
===================== */
router.get("/dashboard", requireCompany, async (req, res) => {
  const companyId = req.user.companyId;

  try {
    const incomeRes = await pool.query(
      `SELECT COALESCE(SUM(ll.credit),0) AS income
       FROM ledger_entries le
       JOIN ledger_lines ll ON ll.ledger_entry_id = le.id
       JOIN accounts a ON a.id = ll.account_id
       WHERE le.company_id=$1 AND le.status='posted' AND a.code BETWEEN 4000 AND 4999`,
      [companyId]
    );

    const expenseRes = await pool.query(
      `SELECT COALESCE(SUM(ll.debit),0) AS expenses
       FROM ledger_entries le
       JOIN ledger_lines ll ON ll.ledger_entry_id = le.id
       JOIN accounts a ON a.id = ll.account_id
       WHERE le.company_id=$1 AND le.status='posted' AND a.code BETWEEN 5000 AND 5999`,
      [companyId]
    );

    const recentRes = await pool.query(
      `SELECT le.id, le.date, le.description, le.source_type,
        SUM(CASE WHEN a.code BETWEEN 4000 AND 4999 THEN ll.credit
                 WHEN a.code BETWEEN 5000 AND 5999 THEN ll.debit ELSE 0 END) AS amount,
        CASE WHEN MAX(a.code) BETWEEN 5000 AND 5999 THEN 'Expense' ELSE 'Income' END AS type
       FROM ledger_entries le
       JOIN ledger_lines ll ON ll.ledger_entry_id = le.id
       JOIN accounts a ON a.id = ll.account_id
       WHERE le.company_id=$1 AND le.status='posted'
       GROUP BY le.id, le.date, le.description, le.source_type
       ORDER BY le.date DESC
       LIMIT 10`,
      [companyId]
    );

    const invoiceRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM invoices WHERE company_id=$1`,
      [companyId]
    );

    const income = Number(incomeRes.rows[0].income);
    const expenses = Number(expenseRes.rows[0].expenses);

    res.json({
      income,
      expenses,
      profit: income - expenses,
      invoices: invoiceRes.rows[0].count,
      recent: recentRes.rows,
    });
  } catch (err) {
    console.error("DASHBOARD ERROR:", err);
    res.status(500).json({ error: "Dashboard fetch failed" });
  }
});

/* =====================
   INCOME STATEMENT
===================== */
router.get("/income-statement", requireCompany, async (req, res) => {
  const companyId = req.user.companyId;

  try {
    const { rows } = await pool.query(
      `SELECT
         CASE WHEN a.code BETWEEN 4000 AND 4999 THEN 'income'
              WHEN a.code BETWEEN 5000 AND 5999 THEN 'expense' END AS category,
         SUM(CASE WHEN a.code BETWEEN 4000 AND 4999 THEN ll.credit
                  WHEN a.code BETWEEN 5000 AND 5999 THEN ll.debit END) AS amount
       FROM ledger_entries le
       JOIN ledger_lines ll ON ll.ledger_entry_id = le.id
       JOIN accounts a ON a.id = ll.account_id
       WHERE le.company_id=$1 AND le.status='posted' AND a.code BETWEEN 4000 AND 5999
       GROUP BY category`,
      [companyId]
    );

    const income = Number(rows.find(r => r.category === "income")?.amount || 0);
    const expenses = Number(rows.find(r => r.category === "expense")?.amount || 0);

    res.json({ income, expenses, profit: income - expenses });
  } catch (err) {
    console.error("INCOME STATEMENT ERROR:", err);
    res.status(500).json({ error: "Income statement failed" });
  }
});

/* =====================
   BALANCE SHEET
===================== */
router.get("/balance-sheet", requireCompany, async (req, res) => {
  const companyId = req.user.companyId;

  try {
    // 1️⃣ Fetch account balances
    const { rows } = await pool.query(
      `SELECT a.id, a.name, a.code,
          CASE WHEN a.code BETWEEN 1000 AND 1999 THEN 'asset'
               WHEN a.code BETWEEN 2000 AND 2999 THEN 'liability'
               WHEN a.code BETWEEN 3000 AND 3999 THEN 'equity' END AS category,
          SUM(COALESCE(ll.debit,0) - COALESCE(ll.credit,0)) AS balance
       FROM accounts a
       LEFT JOIN ledger_lines ll ON ll.account_id = a.id

LEFT JOIN ledger_entries le ON ll.ledger_entry_id = le.id AND le.status='posted'
       WHERE a.company_id=$1 AND a.code BETWEEN 1000 AND 3999
       GROUP BY a.id, a.name, a.code`,
      [companyId]
    );

    // 2️⃣ Fetch net profit to include in equity
    const incomeStmt = await pool.query(
      `SELECT
         SUM(CASE WHEN a.code BETWEEN 4000 AND 4999 THEN ll.credit ELSE 0 END) -
         SUM(CASE WHEN a.code BETWEEN 5000 AND 5999 THEN ll.debit ELSE 0 END) AS net_profit
       FROM ledger_entries le
       JOIN ledger_lines ll ON ll.ledger_entry_id = le.id
       JOIN accounts a ON a.id = ll.account_id
       WHERE le.company_id=$1 AND le.status='posted' AND a.code BETWEEN 4000 AND 5999`,
      [companyId]
    );
    const netProfit = Number(incomeStmt.rows[0]?.net_profit || 0);

    // 3️⃣ Aggregate totals per category
    const totals = { asset: 0, liability: 0, equity: 0 };
    rows.forEach(r => {
      const cat = r.category;
      let bal = Number(r.balance || 0);

      if (cat === 'liability' || cat === 'equity') bal = -bal; // flip sign
      totals[cat] += bal;
    });

    totals.equity += netProfit; // include net profit in equity

    res.json([
      { category: 'asset', balance: totals.asset },
      { category: 'liability', balance: totals.liability },
      { category: 'equity', balance: totals.equity },
    ]);
  } catch (err) {
    console.error("BALANCE SHEET ERROR:", err);
    res.status(500).json({ error: "Balance sheet failed" });
  }
});

/* =====================
   VAT REPORT
===================== */
router.get("/vat", requireCompany, async (req, res) => {
  const companyId = req.user.companyId;
  const year = new Date().getFullYear();

  try {
    const companyRes = await pool.query(
      `SELECT id, name, tin, rc, industry, vat_registered
       FROM companies
       WHERE id=$1`,
      [companyId]
    );

    const vatRes = await pool.query(
      `SELECT date_trunc('month', le.date) AS month,
              SUM(ll.credit - ll.debit) AS vat_amount
       FROM ledger_entries le
       JOIN ledger_lines ll ON ll.ledger_entry_id = le.id
       JOIN accounts a ON a.id = ll.account_id
       WHERE le.company_id=$1 AND le.status='posted' AND a.code=2100
         AND EXTRACT(YEAR FROM le.date)=$2
       GROUP BY month
       ORDER BY month`,
      [companyId, year]
    );

    res.json({ company: companyRes.rows[0], vat: vatRes.rows });
  } catch (err) {
    console.error("VAT REPORT ERROR:", err);
    res.status(500).json({ error: "VAT report failed" });
  }
});

export default router;