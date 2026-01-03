import express from "express";
import { pool } from "../db/index.js";
import { requireCompany } from "../middleware/requireCompany.js";
import { seedDefaultAccounts } from "../utils/seedDefaultAccounts.js";

const router = express.Router();

/* =====================
   CREATE INVOICE + PENDING LEDGER
===================== */
router.post("/", requireCompany, async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      customer_id = null,
      customer_name,
      invoice_number,
      date,
      subtotal = 0,
      vat = 0,
      total = 0,
      payload = {},
    } = req.body;

    const companyId = req.user.companyId;

    if (!customer_name || !invoice_number || !date) {
      return res.status(400).json({ error: "Missing required invoice fields" });
    }

    await client.query("BEGIN");

    // 1️⃣ Create invoice
    const invoiceRes = await client.query(
      `
      INSERT INTO invoices (
        company_id,
        customer_id,
        customer_name,
        invoice_number,
        date,
        subtotal,
        vat,
        total,
        status,
        payload
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'sent',$9)
      RETURNING *
      `,
      [
        companyId,
        customer_id,
        customer_name,
        invoice_number,
        date,
        subtotal,
        vat,
        total,
        payload,
      ]
    );

    const invoice = invoiceRes.rows[0];

    // 2️⃣ Create pending ledger entry
    const entryRes = await client.query(
      `
      INSERT INTO ledger_entries (
        company_id,
        date,
        description,
        status,
        source_type,
        source_id
      )
      VALUES ($1,$2,$3,'pending','invoice',$4)
      RETURNING id
      `,
      [
        companyId,
        date,
       ` Invoice ${invoice.invoice_number}`,
        invoice.id,
      ]
    );

    const ledgerEntryId = entryRes.rows[0].id;

    // 3️⃣ Fetch required accounts (ensure they exist)
    let accRes = await client.query(
      `
      SELECT code, id
      FROM accounts
      WHERE company_id = $1
        AND code IN (1100,4000,2100)
      `,
      [companyId]
    );

    let accounts = Object.fromEntries(accRes.rows.map((a) => [a.code, a.id]));

    // 🔹 If missing, seed default accounts for this company
    const missingCodes = [1100, 4000, 2100].filter((c) => !accounts[c]);
    if (missingCodes.length) {
      console.log(`Seeding missing accounts for company ${companyId}:`, missingCodes);
      await seedDefaultAccounts(client, companyId);
      accRes = await client.query(
        `
        SELECT code, id
        FROM accounts
        WHERE company_id = $1
          AND code IN (1100,4000,2100)
        `,
        [companyId]
      );
      accounts = Object.fromEntries(accRes.rows.map((a) => [a.code, a.id]));
    }

    // 4️⃣ Final safety check
    if (!accounts[1100] || !accounts[4000] || !accounts[2100]) {
      throw new Error("Required accounts missing after seeding (1100, 4000, 2100)");
    }

    // 5️⃣ Ledger lines (AR, Revenue, VAT)
    await client.query(
      `
      INSERT INTO ledger_lines (ledger_entry_id, account_id, debit, credit)
      VALUES
        ($1,$2,$3,0),
        ($1,$4,0,$5),
        ($1,$6,0,$7)
      `,
      [
        ledgerEntryId,
        accounts[1100], // Accounts Receivable
        total,
        accounts[4000], // Revenue
        subtotal,
        accounts[2100], // VAT Payable
        vat,
      ]
    );

    await client.query("COMMIT");
    res.json(invoice);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("CREATE INVOICE ERROR:", err);
    res.status(500).json({
      error: err.message || "Failed to create invoice",
    });
  } finally {
    client.release();
  }
});

/* =====================
   MARK INVOICE AS PAID + POST LEDGER
===================== */
router.post("/:invoiceId/pay", requireCompany, async (req, res) => {
  const client = await pool.connect();

  try {
    const { invoiceId } = req.params;
    const { amount = 0 } = req.body;
    const companyId = req.user.companyId;

if (amount <= 0) {
      return res.status(400).json({ error: "Invalid payment amount" });
    }

    await client.query("BEGIN");

    // 1️⃣ Mark invoice paid
    await client.query(
      `
      UPDATE invoices
      SET status = 'paid'
      WHERE id = $1 AND company_id = $2
      `,
      [invoiceId, companyId]
    );

    // 2️⃣ Fetch pending ledger entry
    const entryRes = await client.query(
      `
      SELECT id
      FROM ledger_entries
      WHERE source_type = 'invoice'
        AND source_id = $1
        AND status = 'pending'
      `,
      [invoiceId]
    );

    const ledgerEntryId = entryRes.rows[0]?.id;
    if (!ledgerEntryId) throw new Error("Pending ledger entry not found");

    await client.query(
      `UPDATE ledger_entries SET status='posted' WHERE id=$1`,
      [ledgerEntryId]
    );

    // 3️⃣ Fetch cash + AR accounts
    const accRes = await client.query(
      `
      SELECT code, id
      FROM accounts
      WHERE company_id = $1
        AND code IN (1000,1100)
      `,
      [companyId]
    );

    const accounts = Object.fromEntries(accRes.rows.map((a) => [a.code, a.id]));

    if (!accounts[1000] || !accounts[1100]) {
      throw new Error("Required accounts missing (1000, 1100)");
    }

    // 4️⃣ Ledger lines (Cash, AR)
    await client.query(
      `
      INSERT INTO ledger_lines (ledger_entry_id, account_id, debit, credit)
      VALUES
        ($1,$2,$3,0),
        ($1,$4,0,$3)
      `,
      [
        ledgerEntryId,
        accounts[1000], // Cash
        amount,
        accounts[1100], // Accounts Receivable
      ]
    );

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("PAY INVOICE ERROR:", err);
    res.status(500).json({
      error: err.message || "Failed to post payment",
    });
  } finally {
    client.release();
  }
});

/* =====================
   LIST COMPANY INVOICES
===================== */
router.get("/company", requireCompany, async (req, res) => {
  try {
    const companyId = req.user.companyId;

    const { rows } = await pool.query(
      `
      SELECT *
      FROM invoices
      WHERE company_id = $1
      ORDER BY created_at DESC
      `,
      [companyId]
    );

    res.json(rows);
  } catch (err) {
    console.error("FETCH INVOICES ERROR:", err);
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

export default router;