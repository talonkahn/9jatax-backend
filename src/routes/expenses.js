import express from "express";
import { pool } from "../db/index.js";
import { requireCompany } from "../middleware/requireCompany.js";

const router = express.Router();

/*
POST /api/expenses
Creates a posted ledger entry + balanced ledger lines
*/
router.post("/", requireCompany, async (req, res) => {
  const {
    date,
    description,
    amount,
    expenseAccountCode,
    paymentAccountCode = 1000, // Cash default
  } = req.body;

  const companyId = req.user.companyId;

  // HARD VALIDATION
  if (
    !companyId ||
    !date ||
    !description ||
    !amount ||
    !expenseAccountCode
  ) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ Ledger entry
    const entryRes = await client.query(
      `
      INSERT INTO ledger_entries
        (company_id, date, description, status, source_type)
      VALUES
        ($1, $2, $3, 'posted', 'expense')
      RETURNING id
      `,
      [companyId, date, description]
    );

    const entryId = entryRes.rows[0].id;

    // 2️⃣ Resolve account UUIDs safely
    const accRes = await client.query(
      `
      SELECT id, code
      FROM accounts
      WHERE company_id = $1
        AND code = ANY($2::int[])
      `,
      [
        companyId,
        [Number(expenseAccountCode), Number(paymentAccountCode)],
      ]
    );

    const accounts = Object.fromEntries(
      accRes.rows.map((r) => [Number(r.code), r.id])
    );

    if (!accounts[Number(expenseAccountCode)]) {
      throw new Error(
        `Expense account ${expenseAccountCode} not found for company`
      );
    }

    if (!accounts[Number(paymentAccountCode)]) {
      throw new Error(
        `Payment account ${paymentAccountCode} not found for company`
      );
    }

    // 3️⃣ Double-entry posting
    await client.query(
      `
      INSERT INTO ledger_lines
        (ledger_entry_id, account_id, debit, credit)
      VALUES
        ($1, $2, $3, 0),
        ($1, $4, 0, $3)
      `,
      [
        entryId,
        accounts[Number(expenseAccountCode)], // Expense (Debit)
        amt,
        accounts[Number(paymentAccountCode)], // Cash / Bank (Credit)
      ]
    );

    await client.query("COMMIT");
    res.json({ success: true, entryId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("EXPENSE ERROR:", err);
    res.status(500).json({
      error: err.message || "Failed to create expense",
    });
  } finally {
    client.release();
  }
});

/*
GET recent expenses for logged-in company
*/
router.get("/company", requireCompany, async (req, res) => {
  const companyId = req.user.companyId;

  try {
    const expenseAccountCodes = [5100, 5200, 5300, 5400, 5500];

    const { rows } = await pool.query(
      `
      SELECT
        le.id,
        le.date,
        le.description AS name,
        a.name AS category,
        ll.debit AS amount
      FROM ledger_entries le
      JOIN ledger_lines ll ON ll.ledger_entry_id = le.id
      JOIN accounts a ON a.id = ll.account_id
      WHERE le.company_id = $1
        AND le.source_type = 'expense'
        AND ll.debit > 0
        AND a.code = ANY($2::int[])
      ORDER BY le.date DESC
      `,
      [companyId, expenseAccountCodes]
    );

    res.json(rows);
  } catch (err) {
    console.error("EXPENSE FETCH ERROR:", err);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
});

export default router;