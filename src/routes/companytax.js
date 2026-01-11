import express from "express";
import { createClient } from "@supabase/supabase-js";

const router = express.Router();

// 🔐 SERVER-SIDE Supabase client (NO RLS ISSUES)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/*
UPSERT tax settings for a company
*/
router.post("/", async (req, res) => {
  try {
    const {
      company_id,
      vat_enabled = false,
      vat_rate = 7.5,
      paye_enabled = false,
      withholding_enabled = false,
      stamp_duty_enabled = false,
    } = req.body;

    if (!company_id) {
      return res.status(400).json({ error: "company_id required" });
    }

    const { data, error } = await supabase
      .from("company_tax_settings")
      .upsert(
        {
          company_id,
          vat_enabled,
          vat_rate,
          paye_enabled,
          withholding_enabled,
          stamp_duty_enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" }
      )
      .select()
      .single();

    if (error) {
      console.error("UPSERT TAX SETTINGS ERROR:", error);
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    console.error("TAX SETTINGS FATAL:", err);
    res.status(500).json({ error: "Failed to save tax settings" });
  }
});

/*
GET tax settings for company
*/
router.get("/:companyId", async (req, res) => {
  try {
    const { companyId } = req.params;

    const { data, error } = await supabase
      .from("company_tax_settings")
      .select("*")
      .eq("company_id", companyId)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    res.json(data || null);
  } catch (err) {
    console.error("GET TAX SETTINGS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch tax settings" });
  }
});

export default router;