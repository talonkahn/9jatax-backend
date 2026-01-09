import express from "express";
import { createClient } from "@supabase/supabase-js";
import { requireCompany } from "../middleware/requireCompany.js";

const router = express.Router();

// Supabase client (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

  try {
    // 1️⃣ Create ledger entry
    const { data: entryData, error: entryErr } = await supabase
      .from("ledger_entries")
      .insert({
        company_id: companyId,
        date,
        description,
        status: "posted",
        source_type: "income"
      })
      .select("id")
      .single();

    if (entryErr) throw entryErr;

    const entryId = entryData.id;

    // 2️⃣ Resolve accounts
    const { data: accountsData, error: accErr } = await supabase
      .from("accounts")
      .select("id, code")
      .eq("company_id", companyId)
      .in("code", [Number(incomeAccountCode), Number(paymentAccountCode)]);

    if (accErr) throw accErr;

    const accounts = Object.fromEntries(accountsData.map(a => [Number(a.code), a.id]));

    if (!accounts[Number(paymentAccountCode)]) {
      throw new Error(`Payment account ${paymentAccountCode} not found`);
    }

    if (!accounts[Number(incomeAccountCode)]) {
      throw new Error(`Income account ${incomeAccountCode} not found`);
    }

    // 3️⃣ Double-entry posting
    const { error: lineErr } = await supabase.from("ledger_lines").insert([
      {
        ledger_entry_id: entryId,
        account_id: accounts[Number(paymentAccountCode)], // Cash ↑
        debit: Number(amount),
        credit: 0
      },
      {
        ledger_entry_id: entryId,
        account_id: accounts[Number(incomeAccountCode)], // Revenue ↑
        debit: 0,
        credit: Number(amount)
      }
    ]);

    if (lineErr) throw lineErr;

    res.json({ success: true, entryId });

  } catch (err) {
    console.error("INCOME ERROR:", err);
    res.status(500).json({ error: err.message || "Failed to post income" });
  }
});

export default router;