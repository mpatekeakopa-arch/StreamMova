import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./login.css";
import { supabase } from "../lib/supabaseClient"; // adjust path if your Login.js lives elsewhere

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      // Optional: store minimal user locally if your UI expects it
     const { data } = await supabase.auth.getUser();
        const u = data?.user;
        
        if (u?.id) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", u.id)
            .single();
        
          localStorage.setItem(
            "user",
            JSON.stringify({
              id: u.id,
              email: u.email,
              username: profile?.username || null,
            })
          );
        }

      window.location.href = "/dashboard";
    } catch (err) {
      setError(err?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">StreamMova</h1>
        <p className="login-subtitle">
          Sign in to manage your streams and destinations
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={loading}
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              disabled={loading}
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Login"}
          </button>
        </form>

        <div className="login-footer">
          <button
            type="button"
            onClick={() => navigate("/register")}
            className="link-btn"
            disabled={loading}
          >
            Create account
          </button>
          <span className="separator">•</span>
          <a href="/forgot-password" className="link-btn">
            Forgot password?
          </a>
        </div>
      </div>
    </div>
  );
}
