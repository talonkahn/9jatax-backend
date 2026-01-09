import express from "express";
import { supabase } from "../db/index.js";

const router = express.Router();

/* =====================
   GET USERS BY COMPANY
===================== */
router.get("/company/:companyId", async (req, res) => {
  try {
    const { companyId } = req.params;

    const { data, error } = await supabase
      .from("company_users")
      .select("id, user_email, role, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error("FETCH USERS ERROR:", err.message);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

/* =====================
   ADD USER
===================== */
router.post("/", async (req, res) => {
  try {
    const { company_id, user_email, role } = req.body;

    if (!company_id || !user_email || !role) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const { data, error } = await supabase
      .from("company_users")
      .insert([
        {
          company_id,
          user_email,
          role,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error("ADD USER ERROR:", err.message);
    res.status(500).json({ error: "Failed to add user" });
  }
});

/* =====================
   UPDATE USER ROLE
===================== */
router.put("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({ error: "Role required" });
    }

    const { data, error } = await supabase
      .from("company_users")
      .update({
        role,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error("UPDATE USER ERROR:", err.message);
    res.status(500).json({ error: "Failed to update user" });
  }
});

/* =====================
   DELETE USER
===================== */
router.delete("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const { error } = await supabase
      .from("company_users")
      .delete()
      .eq("id", userId);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE USER ERROR:", err.message);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

export default router;