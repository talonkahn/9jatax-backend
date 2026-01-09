import express from "express";
import { supabase } from "../db/index.js"; // ✅ FIXED IMPORT

const router = express.Router();

/*
UPSERT tax settings for a company
*/
router.post("/", async (req, res) => {
  const {
    company_id,
    vat_enabled,
    vat_rate = 7.5,
    paye_enabled,
    withholding_enabled,
    stamp_duty_enabled,
  } = req.body;

  if (!company_id) {
    return res.status(400).json({ error: "company_id required" });
  }

  try {
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

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error("TAX SETTINGS ERROR:", err.message);
    res.status(500).json({ error: "Failed to save tax settings" });
  }
});

/*
GET tax settings for company
*/
router.get("/:companyId", async (req, res) => {
  const { companyId } = req.params;

  try {
    const { data, error } = await supabase
      .from("company_tax_settings")
      .select("*")
      .eq("company_id", companyId)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    res.json(data || null);
  } catch (err) {
    console.error("GET TAX SETTINGS ERROR:", err.message);
    res.status(500).json({ error: "Failed to fetch tax settings" });
  }
});

export default router;