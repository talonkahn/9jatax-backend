import express from "express";
import { pool } from "../db/index.js";
import { requireCompany } from "../middleware/requireCompany.js";

const router = express.Router();

/* =====================
   CREATE LEDGER ENTRY FROM INVOICE
===================== */
router.post("/from-invoice", requireCompany, async (req, res) => {
  const { invoiceId, date, subtotal, vat = 0, total } = req.body;
  const companyId = req.user.companyId;

  if (!invoiceId || !date || subtotal == null || total == null) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const entryRes = await client.query(
      `
      INSERT INTO ledger_entries
        (company_id, date, description, status, source_type, source_id)
      VALUES ($1, $2, $3, 'posted', 'invoice', $4)
      RETURNING id
      `,
      [companyId, date, `Invoice ${invoiceId}`, invoiceId]
    );

    const entryId = entryRes.rows[0].id;

    const accRes = await client.query(
      `SELECT id, code FROM accounts WHERE company_id = $1`,
      [companyId]
    );

    const acc = Object.fromEntries(accRes.rows.map(a => [Number(a.code), a.id]));

    if (!acc[1100]) throw new Error("Accounts Receivable (1100) missing");
    if (!acc[4000]) throw new Error("Revenue (4000) missing");
    if (Number(vat) > 0 && !acc[2100]) throw new Error("VAT Payable (2100) missing");

    const lines = [
      { account: acc[1100], debit: Number(total), credit: 0 },
      { account: acc[4000], debit: 0, credit: Number(subtotal) }
    ];

    if (Number(vat) > 0) {
      lines.push({ account: acc[2100], debit: 0, credit: Number(vat) });
    }

    const values = [];
    const placeholders = lines.map((l, i) => {
      const base = i * 4;
      values.push(entryId, l.account, l.debit, l.credit);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
    });

    await client.query(
      `INSERT INTO ledger_lines (ledger_entry_id, account_id, debit, credit) VALUES ${placeholders.join(",")}`,
      values
    );

    await client.query("COMMIT");
    res.json({ success: true, entryId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("LEDGER INVOICE ERROR:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

/* =====================
   GET FULL LEDGER
===================== */
router.get("/", requireCompany, async (req, res) => {
  const companyId = req.user.companyId;

  try {
    const { rows } = await pool.query(
      `
      SELECT
        le.id,
        le.date,
        le.description,
        le.status,
        le.source_type,
        json_agg(
          json_build_object(
            'account_code', a.code,
            'account_name', a.name,
            'debit', ll.debit,
            'credit', ll.credit
          )
          ORDER BY a.code
        ) AS lines
      FROM ledger_entries le
      JOIN ledger_lines ll ON ll.ledger_entry_id = le.id
      JOIN accounts a ON a.id = ll.account_id
      WHERE le.company_id = $1
      GROUP BY le.id, le.date, le.description, le.status, le.source_type
      ORDER BY le.date DESC, le.id DESC
      `,
      [companyId]
    );

    res.json(rows);
  } catch (err) {
    console.error("LEDGER FETCH ERROR:", err.message);
    res.status(500).json({ error: "Failed to fetch ledger" });
  }
});

/* =====================
   GET LEDGER FOR SPECIFIC COMPANY
===================== */
router.get("/company/:companyId", async (req, res) => {
  const { companyId } = req.params;

  try {
    const { rows } = await pool.query(
      `
      SELECT
        le.id,
        le.date,
        le.description,
        le.status,
        le.source_type,
        json_agg(
          json_build_object(
            'account_code', a.code,
            'account_name', a.name,
            'debit', ll.debit,
            'credit', ll.credit
          )
          ORDER BY a.code
        ) AS lines
      FROM ledger_entries le
      JOIN ledger_lines ll ON ll.ledger_entry_id = le.id

JOIN accounts a ON a.id = ll.account_id
      WHERE le.company_id = $1
      GROUP BY le.id, le.date, le.description, le.status, le.source_type
      ORDER BY le.date DESC, le.id DESC
      `,
      [companyId]
    );

    if (!rows.length) return res.status(404).json({ error: "Ledger not found" });
    res.json(rows);
  } catch (err) {
    console.error("LEDGER COMPANY FETCH ERROR:", err.message);
    res.status(500).json({ error: "Failed to fetch ledger for company" });
  }
});

/* =====================
   RECENT ACTIVITY (DASHBOARD)
===================== */
router.get("/recent", requireCompany, async (req, res) => {
  const companyId = req.user.companyId;

  try {
    const { rows } = await pool.query(
      `
      SELECT
        le.id,
        le.date,
        le.description,
        SUM(COALESCE(ll.debit, 0) - COALESCE(ll.credit, 0)) AS amount
      FROM ledger_entries le
      JOIN ledger_lines ll ON ll.ledger_entry_id = le.id
      WHERE le.company_id = $1
      GROUP BY le.id, le.date, le.description
      ORDER BY le.date DESC
      LIMIT 5
      `,
      [companyId]
    );

    res.json(rows);
  } catch (err) {
    console.error("RECENT LEDGER ERROR:", err.message);
    res.status(500).json({ error: "Failed to fetch recent activity" });
  }
});

export default router;