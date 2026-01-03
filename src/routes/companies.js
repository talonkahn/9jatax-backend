import express from "express";
import { pool } from "../db/index.js";
import { seedDefaultAccounts } from "../utils/seedDefaultAccounts.js";

const router = express.Router();

/* =====================
   CREATE COMPANY
===================== */
router.post("/", async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      owner_user_id,
      name,
      tin,
      rc,
      industry,
      vat_registered,
    } = req.body;

    if (!owner_user_id || !name) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    await client.query("BEGIN");

    // 1️⃣ Create company
    const { rows } = await client.query(
      `
      INSERT INTO companies (
        owner_user_id,
        name,
        tin,
        rc,
        industry,
        vat_registered
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [owner_user_id, name, tin, rc, industry, vat_registered]
    );

    const company = rows[0];

    // 2️⃣ Assign Admin role
    await client.query(
      `
      INSERT INTO company_users (company_id, user_id, role)
      VALUES ($1, $2, 'Admin')
      `,
      [company.id, owner_user_id]
    );

    // 3️⃣ Seed default chart of accounts
    await seedDefaultAccounts(client, company.id);

    await client.query("COMMIT");

    res.json(company);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("CREATE COMPANY ERROR:", err);
    res.status(500).json({ error: "Failed to create company" });
  } finally {
    client.release();
  }
});

/* =====================
   GET CURRENT USER COMPANY (🔥 IMPORTANT)
===================== */
router.get("/me/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const { rows } = await pool.query(
      `
      SELECT c.*
      FROM companies c
      JOIN company_users cu ON cu.company_id = c.id
      WHERE cu.user_id = $1
      ORDER BY c.created_at DESC
      LIMIT 1
      `,
      [userId]
    );

    if (rows.length === 0) {
      return res.json(null);
    }

    res.json(rows[0]);
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

    const { rows } = await pool.query(
      `
      SELECT *
      FROM companies
      WHERE owner_user_id = $1
      ORDER BY created_at DESC
      `,
      [userId]
    );

    res.json(rows);
  } catch (err) {
    console.error("FETCH COMPANIES ERROR:", err);
    res.status(500).json({ error: "Failed to fetch companies" });
  }
});

/* =====================
   GET SINGLE COMPANY
===================== */
router.get("/:companyId", async (req, res) => {
  try {
    const { companyId } = req.params;

    const { rows } = await pool.query(
      `SELECT * FROM companies WHERE id = $1`,
      [companyId]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("FETCH COMPANY ERROR:", err);
    res.status(500).json({ error: "Company fetch failed" });
  }
});

export default router;