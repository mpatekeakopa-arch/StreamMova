import React, { useState } from "react";
import "./login.css";
import { authClient } from "../auth";

const BACKEND_URL = "http://localhost:5000";

export default function Login() {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState(""); // used for sign-up
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function logLogin({ auth_user_id, provider, success, failure_reason }) {
    try {
      await fetch(`${BACKEND_URL}/api/auth/logins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auth_user_id: auth_user_id || null,
          provider,
          success,
          failure_reason,
        }),
      });
    } catch {
      // Don't block auth if logging fails
    }
  }

  async function upsertUser({ auth_user_id, email, display_name, avatar_url }) {
    try {
      await fetch(`${BACKEND_URL}/api/users/upsert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auth_user_id,
          email,
          display_name,
          avatar_url,
        }),
      });
    } catch {
      // Don't block auth if upsert fails
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }

    if (mode === "signup" && !displayName.trim()) {
      setError("Please enter your name.");
      return;
    }

    setLoading(true);

    try {
      let result;

      if (mode === "signup") {
        // ✅ Create account
        result = await authClient.signUp.email({
          email,
          password,
          name: displayName.trim(),
        });
      } else {
        // ✅ Sign in
        result = await authClient.signIn.email({
          email,
          password,
        });
      }

      /**
       * Neon auth SDKs often return a structured object.
       * Some return { user }, others return { data: { user }, error }.
       * This handles both shapes safely.
       */
      const possibleError = result?.error;
      if (possibleError) {
        const msg = possibleError?.message || "Authentication failed.";
        setError(msg);
        await logLogin({
          auth_user_id: null,
          provider: "email",
          success: false,
          failure_reason: msg,
        });
        return;
      }

      const user =
        result?.user ||
        result?.data?.user ||
        result?.data?.session?.user ||
        null;

      if (!user?.id) {
        // Some flows may require email verification before a user/session is returned.
        const msg =
          mode === "signup"
            ? "Account created. Please check your email to verify, then sign in."
            : "Signed in, but user session not returned. Try again.";
        setError(msg);

        await logLogin({
          auth_user_id: null,
          provider: "email",
          success: mode !== "signup", // treat signup as "pending"
          failure_reason: mode === "signup" ? "verification_required" : msg,
        });
        return;
      }

      // ✅ Sync user profile into your Neon "users" table
      await upsertUser({
        auth_user_id: user.id,
        email: user.email || email,
        display_name: user.name || displayName || null,
        avatar_url: user.image || null,
      });

      // ✅ Record successful login event
      await logLogin({
        auth_user_id: user.id,
        provider: "email",
        success: true,
      });

      window.location.href = "/dashboard";
    } catch (err) {
      const msg = err?.message || "Authentication failed.";
      setError(msg);

      await logLogin({
        auth_user_id: null,
        provider: "email",
        success: false,
        failure_reason: msg,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setLoading(true);

    try {
      await authClient.signIn.oauth({
        provider: "google",
        redirectUrl: `${window.location.origin}/dashboard`,
      });
      // After redirect, /dashboard loads; we log google there (recommended)
    } catch (err) {
      const msg = err?.message || "Google sign-in failed.";
      setError(msg);

      await logLogin({
        auth_user_id: null,
        provider: "google",
        success: false,
        failure_reason: msg,
      });

      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">StreamMova</h1>
        <p className="login-subtitle">
          {mode === "signup"
            ? "Create an account to start streaming"
            : "Sign in to manage your streams and destinations"}
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          {mode === "signup" && (
            <label>
              Name
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" disabled={loading}>
            {loading
              ? mode === "signup"
                ? "Creating account…"
                : "Signing in…"
              : mode === "signup"
              ? "Sign up"
              : "Login"}
          </button>
        </form>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          style={{ marginTop: 12, width: "100%" }}
        >
          Continue with Google
        </button>

        <div className="login-footer" style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          {mode === "signin" ? (
            <>
              <button type="button" onClick={() => setMode("signup")} style={{ background: "none", border: "none", cursor: "pointer" }}>
                Create account
              </button>
              <a href="/forgot-password">Forgot password?</a>
            </>
          ) : (
            <button type="button" onClick={() => setMode("signin")} style={{ background: "none", border: "none", cursor: "pointer" }}>
              Already have an account? Sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
