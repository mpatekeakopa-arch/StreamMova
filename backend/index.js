console.log("🚀 Backend file loaded");

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { pool } = require("./db");

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || true }));
app.use(express.json());

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

/* ---------------- START SERVER ---------------- */
console.log("🚀 About to start server...");

const PORT = Number(process.env.PORT || 5000);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
