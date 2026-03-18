console.log("🚀 Backend file loaded");

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const { pool } = require("./db");
const { v4: uuidv4 } = require("uuid");

const app = express();

/* ---------------- CORS ---------------- */
const allowedOrigins = [
  process.env.CLIENT_URL, // e.g. https://your-frontend.netlify.app
  "http://localhost:3000",
  "http://localhost:5173",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
  })
);

app.use(express.json());

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/* ---------------- HEALTH ROUTES ---------------- */
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "backend", time: new Date().toISOString() });
});

app.get("/api/health/db", async (req, res) => {
  try {
    const r = await pool.query("SELECT NOW() as now");
    res.json({ ok: true, now: r.rows[0].now });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/* ---------------- AUTH TABLE DETECTION ---------------- */

let AUTH_TABLE = null; // will become: { schema: 'neon_auth', name: 'users' | '"user"', fq: 'neon_auth.users' | 'neon_auth."user"' }
let AUTH_COLS = new Set();

async function detectAuthTable() {
  // Try common Neon Auth table names:
  // - neon_auth.users
  // - neon_auth."user"
  const candidates = ["neon_auth.users", 'neon_auth."user"'];

  for (const fq of candidates) {
    const r = await pool.query("SELECT to_regclass($1) AS t", [fq]);
    if (r.rows[0]?.t) {
      const [schema, name] = fq.split(".");
      AUTH_TABLE = { schema, name, fq };
      break;
    }
  }

  if (!AUTH_TABLE) {
    throw new Error(
      `Neon auth table not found. Expected one of: neon_auth.users or neon_auth."user".`
    );
  }

  // Load column names so we can insert safely even if schema differs
  const cols = await pool.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
  `,
    [
      AUTH_TABLE.schema,
      AUTH_TABLE.name.replace(/"/g, ""), // remove quotes for information_schema lookup
    ]
  );

  AUTH_COLS = new Set(cols.rows.map((x) => x.column_name));
  console.log(
    `✅ Using auth table: ${AUTH_TABLE.fq} with columns: ${[...AUTH_COLS].join(", ")}`
  );
}

// Build an INSERT dynamically using only columns that exist
function buildAuthInsertPayload({ id, email, name }) {
  // Try to be compatible with common Neon Auth schemas
  const payload = {};

  if (AUTH_COLS.has("id")) payload.id = id;
  if (AUTH_COLS.has("email")) payload.email = email;

  // optional name/display columns
  if (AUTH_COLS.has("name")) payload.name = name;
  if (AUTH_COLS.has("display_name")) payload.display_name = name;

  // role / banned / verified flags (optional)
  if (AUTH_COLS.has("role")) payload.role = "user";
  if (AUTH_COLS.has("banned")) payload.banned = false;

  if (AUTH_COLS.has("emailVerified")) payload["emailVerified"] = false;
  if (AUTH_COLS.has("email_verified")) payload.email_verified = false;

  // timestamps (optional)
  if (AUTH_COLS.has("createdAt")) payload["createdAt"] = new Date();
  if (AUTH_COLS.has("updatedAt")) payload["updatedAt"] = new Date();
  if (AUTH_COLS.has("created_at")) payload.created_at = new Date();
  if (AUTH_COLS.has("updated_at")) payload.updated_at = new Date();

  return payload;
}

async function getAuthUserIdByEmail(email) {
  // Prefer exact match on "email" column
  if (!AUTH_COLS.has("email")) {
    throw new Error(`Auth table ${AUTH_TABLE.fq} has no "email" column.`);
  }

  const r = await pool.query(`SELECT id FROM ${AUTH_TABLE.fq} WHERE email = $1`, [
    email,
  ]);
  return r.rows[0]?.id || null;
}

/**
 * Ensure the Neon auth user row exists (the row referenced by FK).
 * Returns the UUID id that must be used for public.users.auth_user_id.
 */
async function ensureAuthUserExists(email, name = null) {
  if (!AUTH_TABLE) await detectAuthTable();

  const displayName = name || String(email).split("@")[0];

  console.log(`🔍 Checking auth user exists for email: ${email}`);
  const existingId = await getAuthUserIdByEmail(email);

  if (existingId) {
    console.log(`✅ Found existing auth user id: ${existingId}`);
    return existingId;
  }

  // Create new auth user
  const id = uuidv4();
  console.log(`📝 Creating auth user id: ${id} for email: ${email}`);

  const payload = buildAuthInsertPayload({ id, email, name: displayName });
  const cols = Object.keys(payload);

  if (cols.length < 2) {
    // At minimum we expect id + email to exist
    throw new Error(
      `Auth table ${AUTH_TABLE.fq} does not support required columns for insert (id/email).`
    );
  }

  const colSql = cols
    .map((c) => (c.match(/^[a-z_][a-z0-9_]*$/i) ? c : `"${c}"`))
    .join(", ");
  const valSql = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((c) => payload[c]);

  await pool.query(`INSERT INTO ${AUTH_TABLE.fq} (${colSql}) VALUES (${valSql})`, values);

  console.log(`✅ Created auth user in ${AUTH_TABLE.fq}: ${id}`);
  return id;
}

/* ---------------- AUTH ROUTES ---------------- */

// ✅ Email/Password login route
app.post("/api/auth/login", async (req, res) => {
  console.log("=".repeat(50));
  console.log("📧 Email login attempt:", req.body.email);

  const { email, password } = req.body;

  if (!email || !password) {
    console.log("❌ Missing email or password");
    return res.status(400).json({
      ok: false,
      error: "Email and password required",
    });
  }

  try {

    // STEP 1: Ensure auth user exists in Neon auth table (FK target)
    console.log("🔍 Step 1: Ensuring auth user exists (FK target)");
    const auth_user_id = await ensureAuthUserExists(email);
    console.log("✅ Auth user ID:", auth_user_id);

    // STEP 2: Upsert into public.users by auth_user_id
    console.log("🔍 Step 2: Upserting public.users");
    const userResult = await pool.query(
      `
      INSERT INTO users (auth_user_id, email, display_name)
      VALUES ($1, $2, $3)
      ON CONFLICT (auth_user_id) DO UPDATE SET
        email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        updated_at = NOW()
      RETURNING *;
      `,
      [auth_user_id, email, email.split("@")[0]]
    );

    const user = userResult.rows[0];
    console.log("✅ public.users record:", user.id);

    // STEP 3: Log the login event (non-fatal)
    console.log("🔍 Step 3: Logging login event");
    try {
      await pool.query(
        `INSERT INTO login_events (auth_user_id, provider, success)
         VALUES ($1, $2, $3)`,
        [auth_user_id, "email", true]
      );
    } catch (logError) {
      console.log("⚠️ Login logging failed (non-critical):", logError.message);
    }

    // STEP 4: Create JWT token
    console.log("🔍 Step 4: Creating JWT token");
    const token = jwt.sign(
      { uid: user.id, auth_user_id, email: user.email },
      process.env.JWT_SECRET || "fallback_secret_for_testing",
      { expiresIn: "1h" }
    );

    console.log("✅ Login successful for:", email);
    console.log("=".repeat(50));

    return res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        auth_user_id,
        email: user.email,
        display_name: user.display_name,
      },
    });
  } catch (error) {
    console.error("❌ Login error:", error.message);
    console.error(error.stack);
    console.log("=".repeat(50));

    return res.status(500).json({
      ok: false,
      error: "Server error during login: " + error.message,
    });
  }
});

// ✅ Google login route
app.post("/api/auth/google", async (req, res) => {
  console.log("=".repeat(50));
  console.log("🔑 Google login attempt");

  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ ok: false, error: "credential required" });
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

    const email = payload.email;
    const display_name = payload.name || String(email).split("@")[0];
    const avatar_url = payload.picture || null;

    console.log(`👤 Google user: ${email}`);

    // IMPORTANT:
    // Do NOT use payload.sub as auth_user_id if your DB expects a UUID FK to Neon auth users.
    // Instead, map by email to the Neon auth user row.
    const auth_user_id = await ensureAuthUserExists(email, display_name);

    // Upsert into public.users
    const userResult = await pool.query(
      `
      INSERT INTO users (auth_user_id, email, display_name, avatar_url)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (auth_user_id) DO UPDATE SET
        email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = NOW()
      RETURNING *;
      `,
      [auth_user_id, email, display_name, avatar_url]
    );

    const user = userResult.rows[0];
    console.log("✅ public.users record:", user.id);

    // Log login event (best effort)
    try {
      await pool.query(
        `INSERT INTO login_events (auth_user_id, provider, success)
         VALUES ($1, $2, $3)`,
        [auth_user_id, "google", true]
      );
    } catch (e) {
      console.log("⚠️ Login logging failed (non-critical):", e.message);
    }

    // Create JWT
    const token = jwt.sign(
      { uid: user.id, auth_user_id, email: user.email },
      process.env.JWT_SECRET || "fallback_secret_for_testing",
      { expiresIn: "1h" }
    );

    console.log("✅ Google login successful");
    console.log("=".repeat(50));

    return res.json({ ok: true, token, user });
  } catch (e) {
    console.error("❌ Google login error:", e.message);
    console.log("=".repeat(50));

    return res.status(401).json({
      ok: false,
      error: "Google authentication failed: " + e.message,
    });
  }
});

/* ---------------- USER ROUTES ---------------- */

app.post("/api/users/upsert", async (req, res) => {
  console.log("📝 Users upsert attempt:", req.body.email);

  const { auth_user_id, email, display_name, avatar_url } = req.body;

  if (!auth_user_id) {
    return res.status(400).json({ ok: false, error: "auth_user_id required" });
  }

  try {
    // If email is provided, make sure auth row exists for FK consistency
    if (email) {
      await ensureAuthUserExists(email, display_name);
    }

    const q = `
      INSERT INTO users (auth_user_id, email, display_name, avatar_url)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (auth_user_id) DO UPDATE SET
        email = COALESCE(EXCLUDED.email, users.email),
        display_name = COALESCE(EXCLUDED.display_name, users.display_name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
        updated_at = NOW()
      RETURNING *;
    `;

    const r = await pool.query(q, [
      auth_user_id,
      email || null,
      display_name || null,
      avatar_url || null,
    ]);

    console.log("✅ Users upsert successful:", r.rows[0].id);
    res.json({ ok: true, user: r.rows[0] });
  } catch (e) {
    console.error("❌ Upsert error:", e.message);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post("/api/auth/logins", async (req, res) => {
  const { auth_user_id, provider, success, failure_reason } = req.body;

  if (!provider) {
    return res.status(400).json({ ok: false, error: "provider required" });
  }

  try {
    const q = `
      INSERT INTO login_events (auth_user_id, provider, success, failure_reason)
      VALUES ($1, $2, $3, $4)
      RETURNING id;
    `;

    const r = await pool.query(q, [
      auth_user_id || null,
      provider,
      success !== false,
      success === false ? failure_reason || "unknown" : null,
    ]);

    res.json({ ok: true, id: r.rows[0].id });
  } catch (e) {
    console.error("Logins error:", e.message);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

/* ---------------- START SERVER ---------------- */
console.log("🚀 About to start server...");

const PORT = Number(process.env.PORT || 5000);

// Detect auth table once at startup (fail fast if missing)
detectAuthTable()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ Backend running on http://localhost:${PORT}`);
    });
  })
  .catch((e) => {
    console.error("❌ Startup failed:", e.message);
    process.exit(1);
  });