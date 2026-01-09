import express from "express";
import { supabase } from "../db/index.js";

const router = express.Router();

/* =====================
   GET PREFERENCES
===================== */
router.get("/:companyId", async (req, res) => {
  try {
    const { companyId } = req.params;

    const { data, error } = await supabase
      .from("company_preferences")
      .select("*")
      .eq("company_id", companyId)
      .single();

    if (error && error.code !== "PGRST116") throw error; // no rows is fine

    res.json(data || null);
  } catch (err) {
    console.error("FETCH PREFS ERROR:", err.message);
    res.status(500).json({ error: "Failed to fetch preferences" });
  }
});

/* =====================
   CREATE / UPDATE PREFERENCES
===================== */
router.post("/", async (req, res) => {
  try {
    const { company_id, default_currency, timezone, date_format } = req.body;

    if (!company_id) {
      return res.status(400).json({ error: "company_id required" });
    }

    const { data, error } = await supabase
      .from("company_preferences")
      .upsert(
        {
          company_id,
          default_currency,
          timezone,
          date_format,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" }
      )
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error("SAVE PREFS ERROR:", err.message);
    res.status(500).json({ error: "Failed to save preferences" });
  }
});

export default router;