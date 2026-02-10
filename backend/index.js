console.log("🚀 Backend file loaded");

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const { pool } = require("./db");

const app = express();

// CORS: allow Netlify + local dev
const allowedOrigins = [
  process.env.CLIENT_URL,        // e.g. https://streammova.netlify.app
  "http://localhost:3000",       // CRA dev
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // Postman/curl
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`), false);
  },
  credentials: true,
}));

app.use(express.json());

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/* ---------------- HEALTH ROUTES ---------------- */
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "backend", time: new Date().toISOString() });
});

app.get("/api/health/db", async (req, res) => {
  try {
    const r = await pool.query("select now() as now");
    res.json({ ok: true, now: r.rows[0].now });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/* ---------------- USER / AUTH ROUTES ---------------- */
app.post("/api/users/upsert", async (req, res) => {
  const { auth_user_id, email, display_name, avatar_url } = req.body;

  if (!auth_user_id) {
    return res.status(400).json({ ok: false, error: "auth_user_id required" });
  }

  try {
    const q = `
      insert into users (auth_user_id, email, display_name, avatar_url)
      values ($1, $2, $3, $4)
      on conflict (auth_user_id) do update set
        email = coalesce(excluded.email, users.email),
        display_name = coalesce(excluded.display_name, users.display_name),
        avatar_url = coalesce(excluded.avatar_url, users.avatar_url),
        updated_at = now()
      returning *;
    `;

    const r = await pool.query(q, [
      auth_user_id,
      email || null,
      display_name || null,
      avatar_url || null,
    ]);

    res.json({ ok: true, user: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post("/api/auth/logins", async (req, res) => {
  const { auth_user_id, provider, success, failure_reason } = req.body;

  if (!provider) {
    return res.status(400).json({ ok: false, error: "provider required" });
  }

  try {
    const q = `
      insert into login_events (auth_user_id, provider, success, failure_reason)
      values ($1, $2, $3, $4)
      returning id;
    `;

    const r = await pool.query(q, [
      auth_user_id || null,
      provider,
      success !== false,
      success === false ? (failure_reason || "unknown") : null,
    ]);

    res.json({ ok: true, id: r.rows[0].id });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ✅ Google login route
app.post("/api/auth/google", async (req, res) => {
  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ ok: false, error: "credential required" });
  }

  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(500).json({ ok: false, error: "GOOGLE_CLIENT_ID not set" });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ ok: false, error: "JWT_SECRET not set" });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(401).json({ ok: false, error: "Invalid Google token" });
    }

    const auth_user_id = payload.sub;
    const email = payload.email || null;
    const display_name = payload.name || null;
    const avatar_url = payload.picture || null;

    const q = `
      insert into users (auth_user_id, email, display_name, avatar_url)
      values ($1, $2, $3, $4)
      on conflict (auth_user_id) do update set
        email = coalesce(excluded.email, users.email),
        display_name = coalesce(excluded.display_name, users.display_name),
        avatar_url = coalesce(excluded.avatar_url, users.avatar_url),
        updated_at = now()
      returning *;
    `;

    const r = await pool.query(q, [auth_user_id, email, display_name, avatar_url]);
    const user = r.rows[0];

    await pool.query(
      `
        insert into login_events (auth_user_id, provider, success, failure_reason)
        values ($1, $2, $3, $4)
      `,
      [auth_user_id, "google", true, null]
    );

    const token = jwt.sign(
      { uid: user.id, auth_user_id: user.auth_user_id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({ ok: true, token, user });
  } catch (e) {
    console.error(e);
    try {
      await pool.query(
        `
          insert into login_events (auth_user_id, provider, success, failure_reason)
          values ($1, $2, $3, $4)
        `,
        [null, "google", false, String(e)]
      );
    } catch (_) {}

    return res.status(401).json({ ok: false, error: "Google authentication failed" });
  }
});

/* ---------------- START SERVER ---------------- */
console.log("🚀 About to start server...");

const PORT = Number(process.env.PORT || 5000);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
