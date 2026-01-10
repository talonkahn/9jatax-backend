import express from "express";
import { createClient } from "@supabase/supabase-js";
import { seedDefaultAccounts } from "../utils/seedDefaultAccounts.js";

const router = express.Router();

// Supabase client (SERVER SIDE ONLY)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* =====================
   CREATE COMPANY (ONBOARDING)
===================== */
router.post("/", async (req, res) => {
  try {
    const { user_id, name } = req.body;

    // ✅ STRICT + CORRECT validation
    if (!user_id || !name) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 1️⃣ Create company (ONLY fields that exist)
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .insert([{ name }])
      .select()
      .single();

    if (companyError) {
      console.error("CREATE COMPANY ERROR:", companyError);
      return res.status(500).json({ error: "Failed to create company" });
    }

    // 2️⃣ Attach company to user
    const { error: userUpdateError } = await supabase
      .from("users")
      .update({ company_id: company.id })
      .eq("id", user_id);

    if (userUpdateError) {
      console.error("USER UPDATE ERROR:", userUpdateError);
      return res.status(500).json({ error: "Failed to link company to user" });
    }

    // 3️⃣ Seed default chart of accounts
    await seedDefaultAccounts(supabase, company.id);

    res.json(company);
  } catch (err) {
    console.error("CREATE COMPANY FATAL:", err);
    res.status(500).json({ error: "Failed to create company" });
  }
});

/* =====================
   GET CURRENT USER COMPANY
===================== */
router.get("/me/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: user, error } = await supabase
      .from("users")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (error || !user?.company_id) {
      return res.json(null);
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("*")
      .eq("id", user.company_id)
      .single();

    if (companyError) {
      return res.status(500).json({ error: "Failed to fetch company" });
    }

    res.json(company);
  } catch (err) {
    console.error("FETCH MY COMPANY ERROR:", err);
    res.status(500).json({ error: "Failed to fetch company" });
  }
});

/* =====================
   GET SINGLE COMPANY
===================== */
router.get("/:companyId", async (req, res) => {
  try {
    const { companyId } = req.params;

    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .single();

    if (error) {
      console.error("FETCH COMPANY ERROR:", error);
      return res.status(500).json({ error: "Company fetch failed" });
    }

    res.json(data);
  } catch (err) {
    console.error("FETCH COMPANY FATAL:", err);
    res.status(500).json({ error: "Company fetch failed" });
  }
});

export default router;