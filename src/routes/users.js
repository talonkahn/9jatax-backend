import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

/* =====================
   GET USERS BY COMPANY
===================== */
router.get("/company/:companyId", async (req, res) => {
  try {
    const { companyId } = req.params;
    const { rows } = await pool.query(
      `
      SELECT id, user_email, role, created_at
      FROM company_users
      WHERE company_id = $1
      ORDER BY created_at DESC
      `,
      [companyId]
    );
    res.json(rows);
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

    const { rows } = await pool.query(
      `
      INSERT INTO company_users (company_id, user_email, role)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [company_id, user_email, role]
    );

    res.json(rows[0]);
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
    if (!role) return res.status(400).json({ error: "Role required" });

    const { rows } = await pool.query(
      `
      UPDATE company_users
      SET role = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
      `,
      [role, userId]
    );

    res.json(rows[0]);
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
    await pool.query("DELETE FROM company_users WHERE id = $1", [userId]);
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE USER ERROR:", err.message);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

export default router;