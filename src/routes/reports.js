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
   DASHBOARD TOTALS
===================== */
router.get("/dashboard", requireCompany, async (req, res) => {
  const companyId = req.user.companyId;
  try {
    // Income
    const { data: incomeData, error: incomeErr } = await supabase
      .from("ledger_entries")
      .select(`
        ledger_lines (
          debit, credit,
          account_id
        )
      `)
      .eq("company_id", companyId)
      .eq("status", "posted");

    if (incomeErr) throw incomeErr;

    // Flatten ledger lines and filter accounts
    const allLines = [];
    for (const le of incomeData) {
      if (!le.ledger_lines) continue;
      allLines.push(...le.ledger_lines);
    }

    // Fetch all relevant accounts
    const { data: accountsData, error: accErr } = await supabase
      .from("accounts")
      .select("id, code, name")
      .eq("company_id", companyId);

    if (accErr) throw accErr;

    const accounts = Object.fromEntries(accountsData.map(a => [a.id, a.code]));

    const income = allLines
      .filter(l => accounts[l.account_id] >= 4000 && accounts[l.account_id] <= 4999)
      .reduce((sum, l) => sum + Number(l.credit || 0), 0);

    const expenses = allLines
      .filter(l => accounts[l.account_id] >= 5000 && accounts[l.account_id] <= 5999)
      .reduce((sum, l) => sum + Number(l.debit || 0), 0);

    // Recent transactions
    const recent = allLines
      .map(l => {
        const code = accounts[l.account_id];
        return {
          ...l,
          type: code >= 5000 && code <= 5999 ? "Expense" : "Income",
          amount: code >= 5000 && code <= 5999 ? l.debit : l.credit
        };
      })
      .slice(-10)
      .reverse();

    // Invoices count
    const { count: invoiceCount, error: invoiceErr } = await supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId);

    if (invoiceErr) throw invoiceErr;

    res.json({
      income,
      expenses,
      profit: income - expenses,
      invoices: invoiceCount || 0,
      recent
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
    const { data: ledgerData, error } = await supabase
      .from("ledger_entries")
      .select(`
        ledger_lines (
          debit, credit,
          account_id
        )
      `)
      .eq("company_id", companyId)
      .eq("status", "posted");

    if (error) throw error;

    const accountsRes = await supabase
      .from("accounts")
      .select("id, code")
      .eq("company_id", companyId);

    if (accountsRes.error) throw accountsRes.error;

    const accounts = Object.fromEntries(accountsRes.data.map(a => [a.id, a.code]));

    let income = 0;
    let expenses = 0;

    for (const le of ledgerData) {
      for (const l of le.ledger_lines || []) {
        const code = accounts[l.account_id];
        if (code >= 4000 && code <= 4999) income += Number(l.credit || 0);
        if (code >= 5000 && code <= 5999) expenses += Number(l.debit || 0);
      }
    }

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
    const { data: accountsData, error: accErr } = await supabase
      .from("accounts")
      .
select("id, code, name")
      .eq("company_id", companyId);

    if (accErr) throw accErr;

    const { data: ledgerData, error: ledgerErr } = await supabase
      .from("ledger_entries")
      .select(`
        ledger_lines (
          debit, credit,
          account_id
        )
      `)
      .eq("company_id", companyId)
      .eq("status", "posted");

    if (ledgerErr) throw ledgerErr;

    const balances = {};
    for (const acc of accountsData) balances[acc.id] = 0;

    for (const le of ledgerData) {
      for (const l of le.ledger_lines || []) {
        balances[l.account_id] += Number(l.debit || 0) - Number(l.credit || 0);
      }
    }

    let totals = { asset: 0, liability: 0, equity: 0 };

    for (const acc of accountsData) {
      let bal = balances[acc.id] || 0;
      let category = null;
      if (acc.code >= 1000 && acc.code <= 1999) category = "asset";
      else if (acc.code >= 2000 && acc.code <= 2999) category = "liability";
      else if (acc.code >= 3000 && acc.code <= 3999) category = "equity";

      if (category === "liability" || category === "equity") bal = -bal;
      if (category) totals[category] += bal;
    }

    // Net profit
    const { data: incomeData, error: incErr } = await supabase
      .from("ledger_entries")
      .select(`
        ledger_lines (
          debit, credit,
          account_id
        )
      `)
      .eq("company_id", companyId)
      .eq("status", "posted");

    if (incErr) throw incErr;

    let netProfit = 0;
    for (const le of incomeData) {
      for (const l of le.ledger_lines || []) {
        const code = accountsData.find(a => a.id === l.account_id)?.code || 0;
        if (code >= 4000 && code <= 4999) netProfit += Number(l.credit || 0);
        if (code >= 5000 && code <= 5999) netProfit -= Number(l.debit || 0);
      }
    }

    totals.equity += netProfit;

    res.json([
      { category: "asset", balance: totals.asset },
      { category: "liability", balance: totals.liability },
      { category: "equity", balance: totals.equity },
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
    const { data: company, error: compErr } = await supabase
      .from("companies")
      .select("id, name, tin, rc, industry, vat_registered")
      .eq("id", companyId)
      .single();

    if (compErr) throw compErr;

    const { data: vatData, error: vatErr } = await supabase
      .from("ledger_entries")
      .select(`
        date,
        ledger_lines (
          debit, credit,
          account_id
        )
      `)
      .eq("company_id", companyId)
      .eq("status", "posted");

    if (vatErr) throw vatErr;

    // Fetch account code 2100
    const { data: accounts, error: accErr } = await supabase
      .from("accounts")
      .select("id, code")
      .eq("company_id", companyId);

    if (accErr) throw accErr;
    const vatAccountId = accounts.find(a => a.code === 2100)?.id;

    const vatReport = [];

    for (const le of vatData) {
      const month = new Date(le.date).getMonth() + 1;
      let vatAmount = 0;
      for (const l of le.ledger_lines || []) {
        if (l.account_id === vatAccountId) vatAmount += Number(l.credit || 0) - Number(l.debit || 0);
      }
      if (vatAmount !== 0) vatReport.push({ month, vat_amount: vatAmount });
    }

    res.json({ company, vat: vatReport });
  } catch (err) {
    console.error("VAT REPORT ERROR:", err);
    res.status(500).json({ error: "VAT report failed" });
  }
});

export default router;