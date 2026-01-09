import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";

const router = express.Router();

// Environment variables
const JWT_SECRET = process.env.JWT_SECRET || "supersecretvalue123";
const TOKEN_EXPIRY = "7d";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ongxymhxgpejiqbissad.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY missing in .env");
  process.exit(1);
}

// Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/* =====================
   SIGNUP
===================== */
router.post("/signup", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email  !password  !name) {
      return res.status(400).json({ error: "Missing fields" });
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingUser) {
      return res.status(409).json({ error: "User already exists" });
    }

    // Hash password
    const hash = await bcrypt.hash(password, 10);

    // Insert user into Supabase
    const { data, error } = await supabase
      .from("users")
      .insert([{ email, password_hash: hash, name }])
      .select()
      .maybeSingle();

    if (error || !data) {
      console.error("SIGNUP ERROR:", error);
      return res.status(500).json({ error: "Signup failed" });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: data.id, companyId: null, role: "Viewer" },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    res.json({
      token,
      user: { id: data.id, email: data.email, name: data.name, company_id: null, role: "Viewer" },
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
    if (!email || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    // Fetch user by email
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (error || !user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, companyId: null, role: "Viewer" },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, company_id: null, role: "Viewer" },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

/* =====================
   REFRESH TOKEN
===================== */
router.post("/refresh", (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "No token" });

    const token = authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token provided" });

    const decoded = jwt.verify(token, JWT_SECRET);
    const { userId } = decoded;

    const newToken = jwt.sign({ userId, companyId: null, role: "Viewer" }, JWT_SECRET, {
      expiresIn: TOKEN_EXPIRY,
    });

    res.json({
      token: newToken,
      user: { id: userId, company_id: null, role: "Viewer" },
    });
  } catch (err) {
    console.error("REFRESH ERROR:", err.message);
    res.status(401).json({ error: "Invalid token" });
  }
});

export default router;