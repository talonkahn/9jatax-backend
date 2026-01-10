import express from "express";
import { createClient } from "@supabase/supabase-js";
import { seedDefaultAccounts } from "../utils/seedDefaultAccounts.js";
import jwt from "jsonwebtoken";

const router = express.Router();

// Supabase client (SERVER SIDE ONLY)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JWT_SECRET = process.env.JWT_SECRET || "supersecretvalue123";

/* =====================
   CREATE COMPANY
===================== */
router.post("/", async (req, res) => {
  try {
    // ✅ Extract JWT from header
    const authHeader = req.headers.authorization;
    let owner_user_id = null;

    if (authHeader) {
      try {
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        owner_user_id = decoded.userId;
      } catch (err) {
        console.warn("JWT invalid or missing, will fallback to req.body.owner_user_id");
      }
    }

    // ✅ fallback to req.body.owner_user_id (for old users)
    owner_user_id = owner_user_id || req.body.owner_user_id;

    const { name, tin, rc, industry, vat_registered } = req.body;

    if (!owner_user_id || !name) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 1️⃣ Create company
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .insert([
        {
          owner_user_id,
          name,
          tin,
          rc,
          industry,
          vat_registered,
        },
      ])
      .select()
      .single();

    if (companyError) {
      console.error("CREATE COMPANY ERROR:", companyError);
      return res.status(500).json({ error: "Failed to create company" });
    }

    // 2️⃣ Assign Admin role
    const { error: roleError } = await supabase
      .from("company_users")
      .insert([
        {
          company_id: company.id,
          user_id: owner_user_id,
          role: "Admin",
        },
      ]);

    if (roleError) {
      console.error("ASSIGN ROLE ERROR:", roleError);
      return res.status(500).json({ error: "Failed to assign role" });
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

    const { data, error } = await supabase
      .from("company_users")
      .select("companies(*)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return res.json(null);
    }

    res.json(data.companies);
  } catch (err) {
    console.error("FETCH MY COMPANY ERROR:", err);
    res.status(500).json({ error: "Failed to fetch company" });
  }
});

/* =====================
   GET COMPANIES BY OWNER
===================== */
router.get("/owner/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .eq("owner_user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("FETCH COMPANIES ERROR:", error);
      return res.status(500).json({ error: "Failed to fetch companies" });
    }

    res.json(data);
  } catch (err) {
    console.error("FETCH COMPANIES FATAL:", err);
    res.status(500).json({ error: "Failed to fetch companies" });
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
      return res.status(500).

json({ error: "Company fetch failed" });
    }

    res.json(data);
  } catch (err) {
    console.error("FETCH COMPANY FATAL:", err);
    res.status(500).json({ error: "Company fetch failed" });
  }
});

export default router;