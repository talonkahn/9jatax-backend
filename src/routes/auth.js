import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db/index.js";
import { randomUUID } from "crypto";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "perlanet";
const TOKEN_EXPIRY = "7d";

/* =====================
   SIGNUP
===================== */
router.post("/signup", async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const hash = await bcrypt.hash(password, 10);
    const userId = randomUUID();

    const { rows } = await pool.query(
      `
      INSERT INTO users (id, email, password_hash, name)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email, name
      `,
      [userId, email, hash, name]
    );

    const user = rows[0];

    // 🔑 No company yet
    const token = jwt.sign(
      {
        userId: user.id,
        companyId: null,
        role: "Viewer",
      },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        company_id: null,
        role: "Viewer",
      },
    });
  } catch (err) {
    console.error("SIGNUP ERROR:", err);
    res.status(500).json({ error: "Signup failed" });
  }
});

/* =====================
   LOGIN
===================== */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const { rows } = await pool.query(
      `
      SELECT id, email, password_hash, name
      FROM users
      WHERE email = $1
      `,
      [email]
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // 🔍 Check if user already belongs to a company
    const roleRes = await pool.query(
      `
      SELECT company_id, role
      FROM company_users
      WHERE user_id = $1
      LIMIT 1
      `,
      [user.id]
    );

    const companyId = roleRes.rows[0]?.company_id || null;
    const role = roleRes.rows[0]?.role || "Viewer";

    const token = jwt.sign(
      { userId: user.id, companyId, role },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        company_id: companyId,
        role,
      },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

/* =====================
   REFRESH TOKEN (OPTION B 🔥)
   Called after company onboarding
===================== */
router.post("/refresh", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "No token" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const { userId } = decoded;

    const roleRes = await pool.query(
      `
      SELECT company_id, role
      FROM company_users
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId]
    );

    const companyId = roleRes.rows[0]?.company_id || null;
    const role = roleRes.rows[0]?.role || "Viewer";

    const newToken = jwt.sign(
      { userId, companyId, role },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    res.json({
      token: newToken,
      user: {
        id: userId,
        company_id: companyId,
        role,
      },
    });
  } catch (err) {
    console.error("REFRESH ERROR:", err.message);
    res.status(401).json({ error: "Invalid token" });
  }
});

export default router;