import express from "express";
import { pool } from "../db/index.js";
import { requireCompany } from "../middleware/requireCompany.js";

const router = express.Router();

/*
POST /api/income
Creates a posted income ledger entry (Cash → Revenue)
*/
router.post("/", requireCompany, async (req, res) => {
  const {
    date,
    description,
    amount,
    incomeAccountCode = 4000, // Revenue
    paymentAccountCode = 1000 // Cash / Bank
  } = req.body;

  const companyId = req.user.companyId;

  // HARD VALIDATION
  if (!date || !description || amount == null || Number(amount) <= 0) {
    return res.status(400).json({ error: "Missing or invalid fields" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Create ledger entry
    const entryRes = await client.query(
      `
      INSERT INTO ledger_entries
        (company_id, date, description, status, source_type)
      VALUES
        ($1, $2, $3, 'posted', 'income')
      RETURNING id
      `,
      [companyId, date, description]
    );

    const entryId = entryRes.rows[0].id;

    // 2. Resolve accounts
    const accRes = await client.query(
      `
      SELECT id, code
      FROM accounts
      WHERE company_id = $1
        AND code = ANY($2::int[])
      `,
      [
        companyId,
        [Number(incomeAccountCode), Number(paymentAccountCode)]
      ]
    );

    const accounts = {};
    accRes.rows.forEach(r => {
      accounts[Number(r.code)] = r.id;
    });

    if (!accounts[Number(paymentAccountCode)]) {
      throw new Error(`Payment account ${paymentAccountCode} not found`);
    }

    if (!accounts[Number(incomeAccountCode)]) {
      throw new Error(`Income account ${incomeAccountCode} not found`);
    }

    // 3. Double-entry posting
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
        accounts[Number(paymentAccountCode)], // Cash ↑
        Number(amount),
        accounts[Number(incomeAccountCode)]   // Revenue ↑
      ]
    );

    await client.query("COMMIT");
    res.json({ success: true, entryId });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("INCOME ERROR:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

export default router;