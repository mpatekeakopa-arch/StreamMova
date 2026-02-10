import React, { useEffect, useState, useCallback } from "react";
import "./login.css";
import { authClient } from "../auth";

/**
 * Using Neon Auth for email + Google OAuth.
 * Local dev uses your Express backend for /api/* logging + upsert.
 * Production on Netlify will NOT have 127.0.0.1, so these calls are skipped there.
 */
const BACKEND_URL =
  process.env.NODE_ENV === "development" ? "http://127.0.0.1:5000" : "";

export default function Login() {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Helper: no-op in production unless you actually deploy a backend
  const safePost = useCallback(async (path, payload) => {
    if (!BACKEND_URL) return;
    try {
      await fetch(`${BACKEND_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      // Don't block auth if logging fails
    }
  }, []);

  const logLogin = useCallback(
    async ({ auth_user_id, provider, success, failure_reason }) => {
      await safePost("/api/auth/logins", {
        auth_user_id: auth_user_id || null,
        provider,
        success,
        failure_reason,
      });
    },
    [safePost]
  );

  const upsertUser = useCallback(
    async ({ auth_user_id, email, display_name, avatar_url }) => {
      await safePost("/api/users/upsert", {
        auth_user_id,
        email,
        display_name,
        avatar_url,
      });
    },
    [safePost]
  );

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
        result = await authClient.signUp.email({
          email,
          password,
          name: displayName.trim(),
        });
      } else {
        result = await authClient.signIn.email({
          email,
          password,
        });
      }

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
        result?.session?.user ||
        null;

      if (!user?.id) {
        const msg =
          mode === "signup"
            ? "Account created. Please check your email to verify, then sign in."
            : "Signed in, but user session not returned. Try again.";

        setError(msg);

        await logLogin({
          auth_user_id: null,
          provider: "email",
          success: mode !== "signup",
          failure_reason: mode === "signup" ? "verification_required" : msg,
        });
        return;
      }

      await upsertUser({
        auth_user_id: user.id,
        email: user.email || email,
        display_name: user.name || displayName || null,
        avatar_url: user.image || null,
      });

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
      // Debug visibility in console (helpful on Netlify)
      // eslint-disable-next-line no-console
      console.log("REACT_APP_NEON_AUTH_URL =", process.env.REACT_APP_NEON_AUTH_URL);
      // eslint-disable-next-line no-console
      console.log("origin =", window.location.origin);

      const res = await authClient.signIn.oauth({
        provider: "google",
        redirectUrl: `${window.location.origin}/dashboard`,
      });

      // Some SDK versions return a URL instead of auto-redirecting:
      if (res?.url) window.location.href = res.url;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Google sign-in error:", err);

      const msg =
        err?.message ||
        err?.error?.message ||
        (typeof err === "string" ? err : "Google sign-in failed.");

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

  // After Google redirects back, try to read the user/session and sync
  useEffect(() => {
    let cancelled = false;

    async function finishGoogleRedirect() {
      try {
        let res = null;

        if (typeof authClient.user === "function") {
          res = await authClient.user();
        } else if (typeof authClient.getUser === "function") {
          res = await authClient.getUser();
        } else if (typeof authClient.session === "function") {
          res = await authClient.session();
        }

        const user =
          res?.user ||
          res?.data?.user ||
          res?.data?.session?.user ||
          res?.session?.user ||
          null;

        if (!cancelled && user?.id) {
          await upsertUser({
            auth_user_id: user.id,
            email: user.email || null,
            display_name: user.name || null,
            avatar_url: user.image || null,
          });

          await logLogin({
            auth_user_id: user.id,
            provider: "google",
            success: true,
          });

          window.location.href = "/dashboard";
        }
      } catch {
        // ignore
      }
    }

    finishGoogleRedirect();

    return () => {
      cancelled = true;
    };
  }, [logLogin, upsertUser]);

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

        <button className="google-btn" onClick={handleGoogle} disabled={loading}>
          <img
            src="https://developers.google.com/identity/images/g-logo.png"
            alt="Google"
            className="google-icon"
          />
          Log in with Google
        </button>

        <div
          className="login-footer"
          style={{ display: "flex", gap: 12, justifyContent: "center" }}
        >
          {mode === "signin" ? (
            <>
              <button
                type="button"
                onClick={() => setMode("signup")}
                style={{ background: "none", border: "none", cursor: "pointer" }}
                disabled={loading}
              >
                Create account
              </button>
              <a href="/forgot-password">Forgot password?</a>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setMode("signin")}
              style={{ background: "none", border: "none", cursor: "pointer" }}
              disabled={loading}
            >
              Already have an account? Sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
