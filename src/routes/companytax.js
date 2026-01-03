import express from "express";
import { pool } from "../db/index.js";

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
    const { rows } = await pool.query(
      `
      INSERT INTO company_tax_settings (
        company_id,
        vat_enabled,
        vat_rate,
        paye_enabled,
        withholding_enabled,
        stamp_duty_enabled
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (company_id)
      DO UPDATE SET
        vat_enabled = EXCLUDED.vat_enabled,
        vat_rate = EXCLUDED.vat_rate,
        paye_enabled = EXCLUDED.paye_enabled,
        withholding_enabled = EXCLUDED.withholding_enabled,
        stamp_duty_enabled = EXCLUDED.stamp_duty_enabled,
        updated_at = NOW()
      RETURNING *
      `,
      [
        company_id,
        vat_enabled,
        vat_rate,
        paye_enabled,
        withholding_enabled,
        stamp_duty_enabled,
      ]
    );

    res.json(rows[0]);
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

  const { rows } = await pool.query(
    `
    SELECT *
    FROM company_tax_settings
    WHERE company_id = $1
    `,
    [companyId]
  );

  res.json(rows[0] || null);
});

export default router;