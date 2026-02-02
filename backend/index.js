require("dotenv").config();

const express = require("express");
const cors = require("cors");

const { pool } = require("./db");

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || true }));
app.use(express.json());

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

const PORT = Number(process.env.PORT || 5000);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
