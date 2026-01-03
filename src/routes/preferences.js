import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

/* GET preferences */
router.get("/:companyId", async (req, res) => {
  try {
    const { companyId } = req.params;
    const { rows } = await pool.query(
      "SELECT * FROM company_preferences WHERE company_id = $1",
      [companyId]
    );
    res.json(rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch preferences" });
  }
});

/* CREATE/UPDATE preferences */
router.post("/", async (req, res) => {
  try {
    const { company_id, default_currency, timezone, date_format } = req.body;
    if (!company_id) return res.status(400).json({ error: "company_id required" });

    const { rows } = await pool.query(
      `
      INSERT INTO company_preferences (company_id, default_currency, timezone, date_format)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (company_id)
      DO UPDATE SET
        default_currency = EXCLUDED.default_currency,
        timezone = EXCLUDED.timezone,
        date_format = EXCLUDED.date_format,
        updated_at = NOW()
      RETURNING *
      `,
      [company_id, default_currency, timezone, date_format]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save preferences" });
  }
});

export default router;