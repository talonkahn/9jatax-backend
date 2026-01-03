import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "perlanet";

export function requireCompany(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: "No token" });

  const token = auth.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;

    if (!decoded.companyId) {
      return res.status(403).json({ error: "COMPANY_REQUIRED" });
    }

    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}