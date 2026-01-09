import express from "express";
import { createClient } from "@supabase/supabase-js";
import { requireCompany } from "../middleware/requireCompany.js";

const router = express.Router();

// Supabase client (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* =====================
   DEFAULT CHART OF ACCOUNTS
===================== */
const DEFAULT_ACCOUNTS = [
  { code: 1000, name: "Cash", type: "asset" },
  { code: 1100, name: "Accounts Receivable", type: "asset" },

  { code: 2100, name: "VAT Payable", type: "liability" },

  { code: 4000, name: "Sales Revenue", type: "income" },

  { code: 5100, name: "Operating Expenses", type: "expense" },
  { code: 5200, name: "Utilities Expense", type: "expense" },
  { code: 5300, name: "Transport Expense", type: "expense" },
];

/* =====================
   INIT DEFAULT ACCOUNTS (ONCE PER COMPANY)
===================== */
router.post("/init", requireCompany, async (req, res) => {
  try {
    const companyId = req.user.companyId;

    // Check if accounts already exist
    const { data: existing, error: checkError } = await supabase
      .from("accounts")
      .select("id")
      .eq("company_id", companyId)
      .limit(1);

    if (checkError) throw checkError;

    if (existing.length > 0) {
      return res.json({ success: true, message: "Accounts already exist" });
    }

    const rows = DEFAULT_ACCOUNTS.map((a) => ({
      company_id: companyId,
      code: a.code,
      name: a.name,
      type: a.type,
    }));

    const { error } = await supabase.from("accounts").insert(rows);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error("INIT ACCOUNTS ERROR:", err);
    res.status(500).json({ error: "Failed to initialize accounts" });
  }
});

/* =====================
   CREATE CUSTOM ACCOUNT
===================== */
router.post("/", requireCompany, async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const { code, name, type } = req.body;

    if (!code || !name || !type) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const { data, error } = await supabase
      .from("accounts")
      .insert({
        company_id: companyId,
        code,
        name,
        type,
      })
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error("CREATE ACCOUNT ERROR:", err);
    res.status(500).json({ error: "Failed to create account" });
  }
});

/* =====================
   LIST COMPANY ACCOUNTS
===================== */
router.get("/company", requireCompany, async (req, res) => {
  try {
    const companyId = req.user.companyId;

    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("company_id", companyId)
      .order("code");

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error("FETCH ACCOUNTS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

export default router;