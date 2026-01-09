import express from "express";
import { createClient } from "@supabase/supabase-js";
import { requireCompany } from "../middleware/requireCompany.js";
import { seedDefaultAccounts } from "../utils/seedDefaultAccounts.js";

const router = express.Router();

// Supabase client (SERVER SIDE ONLY)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* =====================
   CREATE INVOICE + PENDING LEDGER
===================== */
router.post("/", requireCompany, async (req, res) => {
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

    // 1️⃣ Create invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert([
        {
          company_id: companyId,
          customer_id,
          customer_name,
          invoice_number,
          date,
          subtotal,
          vat,
          total,
          status: "sent",
          payload,
        },
      ])
      .select()
      .single();

    if (invoiceError) throw invoiceError;

    // 2️⃣ Create pending ledger entry
    const { data: ledgerEntry, error: ledgerEntryError } = await supabase
      .from("ledger_entries")
      .insert([
        {
          company_id: companyId,
          date,
          description: Invoice `${invoice.invoice_number}`,
          status: "pending",
          source_type: "invoice",
          source_id: invoice.id,
        },
      ])
      .select()
      .single();

    if (ledgerEntryError) throw ledgerEntryError;

    const ledgerEntryId = ledgerEntry.id;

    // 3️⃣ Fetch required accounts
    let { data: accountsData, error: accError } = await supabase
      .from("accounts")
      .select("code, id")
      .eq("company_id", companyId)
      .in("code", [1100, 4000, 2100]);

    if (accError) throw accError;

    let accounts = Object.fromEntries(accountsData.map(a => [a.code, a.id]));

    // 🔹 Seed missing accounts if needed
    const missingCodes = [1100, 4000, 2100].filter(c => !accounts[c]);
    if (missingCodes.length) {
      console.log(`Seeding missing accounts for company ${companyId}:`, missingCodes);
      await seedDefaultAccounts(supabase, companyId);

      const { data: newAccountsData, error: newAccError } = await supabase
        .from("accounts")
        .select("code, id")
        .eq("company_id", companyId)
        .in("code", [1100, 4000, 2100]);

      if (newAccError) throw newAccError;
      accounts = Object.fromEntries(newAccountsData.map(a => [a.code, a.id]));
    }

    if (!accounts[1100] || !accounts[4000] || !accounts[2100]) {
      throw new Error("Required accounts missing after seeding (1100, 4000, 2100)");
    }

    // 4️⃣ Ledger lines (AR, Revenue, VAT)
    const { error: linesError } = await supabase
      .from("ledger_lines")
      .insert([
        {
          ledger_entry_id: ledgerEntryId,
          account_id: accounts[1100],
          debit: total,
          credit: 0,
        },
        {
          ledger_entry_id: ledgerEntryId,
          account_id: accounts[4000],
          debit: 0,
          credit: subtotal,
        },
        {
          ledger_entry_id: ledgerEntryId,
          account_id: accounts[2100],
          debit: 0,
          credit: vat,
        },
      ]);

    if (linesError) throw linesError;

    res.json(invoice);
  } catch (err) {
    console.error("CREATE INVOICE ERROR:", err.message || err);
    res.status(500).json({ error: err.message || "Failed to create invoice" });
  }
});

/* =====================
   MARK INVOICE AS PAID + POST LEDGER
===================== */
router.post("/:invoiceId/pay", requireCompany, async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { amount = 0 } = req.body;
    const companyId = req.user.

companyId;

    if (amount <= 0) {
      return res.status(400).json({ error: "Invalid payment amount" });
    }

    // 1️⃣ Mark invoice as paid
    const { error: payError } = await supabase
      .from("invoices")
      .update({ status: "paid" })
      .eq("id", invoiceId)
      .eq("company_id", companyId);

    if (payError) throw payError;

    // 2️⃣ Fetch pending ledger entry
    const { data: ledgerEntries, error: ledgerEntryFetchError } = await supabase
      .from("ledger_entries")
      .select("id")
      .eq("source_type", "invoice")
      .eq("source_id", invoiceId)
      .eq("status", "pending");

    if (ledgerEntryFetchError) throw ledgerEntryFetchError;

    const ledgerEntryId = ledgerEntries[0]?.id;
    if (!ledgerEntryId) throw new Error("Pending ledger entry not found");

    // 3️⃣ Post ledger
    const { error: postLedgerError } = await supabase
      .from("ledger_entries")
      .update({ status: "posted" })
      .eq("id", ledgerEntryId);

    if (postLedgerError) throw postLedgerError;

    // 4️⃣ Fetch cash + AR accounts
    const { data: accountsData, error: accountsError } = await supabase
      .from("accounts")
      .select("code, id")
      .eq("company_id", companyId)
      .in("code", [1000, 1100]);

    if (accountsError) throw accountsError;

    const accounts = Object.fromEntries(accountsData.map(a => [a.code, a.id]));

    if (!accounts[1000] || !accounts[1100]) {
      throw new Error("Required accounts missing (1000, 1100)");
    }

    // 5️⃣ Ledger lines (Cash, AR)
    const { error: linesError } = await supabase
      .from("ledger_lines")
      .insert([
        {
          ledger_entry_id: ledgerEntryId,
          account_id: accounts[1000],
          debit: amount,
          credit: 0,
        },
        {
          ledger_entry_id: ledgerEntryId,
          account_id: accounts[1100],
          debit: 0,
          credit: amount,
        },
      ]);

    if (linesError) throw linesError;

    res.json({ success: true });
  } catch (err) {
    console.error("PAY INVOICE ERROR:", err.message || err);
    res.status(500).json({ error: err.message || "Failed to post payment" });
  }
});

/* =====================
   LIST COMPANY INVOICES
===================== */
router.get("/company", requireCompany, async (req, res) => {
  try {
    const companyId = req.user.companyId;

    const { data: invoices, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json(invoices);
  } catch (err) {
    console.error("FETCH INVOICES ERROR:", err.message || err);
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

export default router;