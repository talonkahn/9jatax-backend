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
   CREATE EXPENSE
   Creates a posted ledger entry + balanced ledger lines
===================== */
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
  if (!companyId || !date || !description || amount == null || !expenseAccountCode) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  try {
    // 1️⃣ Create ledger entry
    const { data: entry, error: entryError } = await supabase
      .from("ledger_entries")
      .insert([
        {
          company_id: companyId,
          date,
          description,
          status: "posted",
          source_type: "expense",
        },
      ])
      .select()
      .single();

    if (entryError) throw entryError;

    const entryId = entry.id;

    // 2️⃣ Resolve account IDs
    const { data: accountsData, error: accError } = await supabase
      .from("accounts")
      .select("id, code")
      .eq("company_id", companyId)
      .in("code", [Number(expenseAccountCode), Number(paymentAccountCode)]);

    if (accError) throw accError;

    const accounts = Object.fromEntries(accountsData.map(a => [Number(a.code), a.id]));

    if (!accounts[Number(expenseAccountCode)]) {
      throw new Error(`Expense account ${expenseAccountCode} not found for company`);
    }

    if (!accounts[Number(paymentAccountCode)]) {
      throw new Error(`Payment account ${paymentAccountCode} not found for company`);
    }

    // 3️⃣ Double-entry posting
    const { error: linesError } = await supabase
      .from("ledger_lines")
      .insert([
        {
          ledger_entry_id: entryId,
          account_id: accounts[Number(expenseAccountCode)],
          debit: amt,
          credit: 0,
        },
        {
          ledger_entry_id: entryId,
          account_id: accounts[Number(paymentAccountCode)],
          debit: 0,
          credit: amt,
        },
      ]);

    if (linesError) throw linesError;

    res.json({ success: true, entryId });
  } catch (err) {
    console.error("EXPENSE ERROR:", err.message || err);
    res.status(500).json({ error: err.message || "Failed to create expense" });
  }
});

/* =====================
   GET RECENT EXPENSES FOR COMPANY
===================== */
router.get("/company", requireCompany, async (req, res) => {
  const companyId = req.user.companyId;
  const expenseAccountCodes = [5100, 5200, 5300, 5400, 5500];

  try {
    const { data, error } = await supabase
      .from("ledger_entries")
      .select(`
        id,
        date,
        description,
        ledger_lines(
          debit,
          account_id,
          accounts!inner(name, code)
        )
      `)
      .eq("company_id", companyId)
      .eq("source_type", "expense")
      .order("date", { ascending: false });

    if (error) throw error;

    // Filter only relevant expense account codes
    const rows = data
      .map(le => {
        const line = le.ledger_lines.find(
          ll => expenseAccountCodes.includes(ll.accounts.code)
        );
        if (!line) return null;
        return {
          id: le.id,
          date: le.date,
          name: le.description,
          category: line.accounts.name,
          amount: line.debit,
        };
      })
      .filter(Boolean);

    res.json(rows);
  } catch (err) {
    console.error("EXPENSE FETCH ERROR:", err.message || err);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
});

export default router;