import express from "express";
import { createClient } from "@supabase/supabase-js";
import { requireCompany } from "../middleware/requireCompany.js";

const router = express.Router();

// Supabase client (SERVER SIDE ONLY)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* =====================
   CREATE LEDGER ENTRY FROM INVOICE
===================== */
router.post("/from-invoice", requireCompany, async (req, res) => {
  const { invoiceId, date, subtotal, vat = 0, total } = req.body;
  const companyId = req.user.companyId;

  if (!invoiceId || !date || subtotal == null || total == null) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // 1️⃣ Create ledger entry
    const { data: entry, error: entryError } = await supabase
      .from("ledger_entries")
      .insert([
        {
          company_id: companyId,
          date,
          description: Invoice `${invoiceId}`,
          status: "posted",
          source_type: "invoice",
          source_id: invoiceId,
        },
      ])
      .select()
      .maybeSingle();

    if (entryError  !entry) throw entryError  new Error("Failed to create entry");

    const entryId = entry.id;

    // 2️⃣ Fetch accounts
    const { data: accountsData, error: accError } = await supabase
      .from("accounts")
      .select("id, code")
      .eq("company_id", companyId);

    if (accError) throw accError;

    const acc = Object.fromEntries(accountsData.map(a => [Number(a.code), a.id]));

    if (!acc[1100]) throw new Error("Accounts Receivable (1100) missing");
    if (!acc[4000]) throw new Error("Revenue (4000) missing");
    if (Number(vat) > 0 && !acc[2100]) throw new Error("VAT Payable (2100) missing");

    // 3️⃣ Prepare ledger lines
    const lines = [
      { account_id: acc[1100], debit: Number(total), credit: 0 },
      { account_id: acc[4000], debit: 0, credit: Number(subtotal) },
    ];

    if (Number(vat) > 0) {
      lines.push({ account_id: acc[2100], debit: 0, credit: Number(vat) });
    }

    // 4️⃣ Insert ledger lines
    const { error: linesError } = await supabase
      .from("ledger_lines")
      .insert(lines.map(l => ({
        ledger_entry_id: entryId,
        account_id: l.account_id,
        debit: l.debit,
        credit: l.credit,
      })));

    if (linesError) throw linesError;

    res.json({ success: true, entryId });
  } catch (err) {
    console.error("LEDGER INVOICE ERROR:", err.message, err);
    res.status(500).json({ error: "Failed to create ledger entry" });
  }
});

/* =====================
   GET FULL LEDGER
===================== */
router.get("/", requireCompany, async (req, res) => {
  const companyId = req.user.companyId;

  try {
    const { data, error } = await supabase
      .from("ledger_entries")
      .select(`
        id,
        date,
        description,
        status,
        source_type,
        ledger_lines(
          debit,
          credit,
          accounts!inner(code, name)
        )
      `)
      .eq("company_id", companyId)
      .order("date", { ascending: false });

    if (error) throw error;

    const rows = data.map(le => ({
      id: le.id,
      date: le.date,
      description: le.description,
      status: le.status,
      source_type: le.source_type,
      lines: le.ledger_lines.map(ll => ({
        account_code: ll.accounts.code,
        account_name: ll.accounts.name,
        debit: ll.debit || 0,
        credit: ll.credit || 0,
      })).sort((a, b) => a.account_code - b.account_code),
    }));

    res.json(rows);
  } catch (err) {
    console.error("LEDGER FETCH ERROR:", err.message, err);
    res.status(500).json({ error: "Failed to fetch ledger" });
  }
});

/* =====================
   GET LEDGER FOR SPECIFIC COMPANY
===================== */
router.get("/company/:companyId", async (req, res) => {
  const { companyId } = req.params;

  try {
    const { data, error } = await supabase
      .from("ledger_entries")
      .select(`
        id,
        date,
        description,
        status,

source_type,
        ledger_lines(
          debit,
          credit,
          accounts!inner(code, name)
        )
      `)
      .eq("company_id", companyId)
      .order("date", { ascending: false });

    if (error) throw error;
    if (!data || !data.length) return res.status(404).json({ error: "Ledger not found" });

    const rows = data.map(le => ({
      id: le.id,
      date: le.date,
      description: le.description,
      status: le.status,
      source_type: le.source_type,
      lines: le.ledger_lines.map(ll => ({
        account_code: ll.accounts.code,
        account_name: ll.accounts.name,
        debit: ll.debit || 0,
        credit: ll.credit || 0,
      })).sort((a, b) => a.account_code - b.account_code),
    }));

    res.json(rows);
  } catch (err) {
    console.error("LEDGER COMPANY FETCH ERROR:", err.message, err);
    res.status(500).json({ error: "Failed to fetch ledger for company" });
  }
});

/* =====================
   RECENT ACTIVITY (DASHBOARD)
===================== */
router.get("/recent", requireCompany, async (req, res) => {
  const companyId = req.user.companyId;

  try {
    const { data, error } = await supabase
      .from("ledger_entries")
      .select(`
        id,
        date,
        description,
        ledger_lines(debit, credit)
      `)
      .eq("company_id", companyId)
      .order("date", { ascending: false })
      .limit(5);

    if (error) throw error;

    const rows = data.map(le => ({
      id: le.id,
      date: le.date,
      description: le.description,
      amount: le.ledger_lines.reduce(
        (sum, ll) => sum + (ll.debit || 0) - (ll.credit || 0),
        0
      ),
    }));

    res.json(rows);
  } catch (err) {
    console.error("RECENT LEDGER ERROR:", err.message, err);
    res.status(500).json({ error: "Failed to fetch recent activity" });
  }
});

export default router;