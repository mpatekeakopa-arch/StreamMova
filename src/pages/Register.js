import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import "./register.css";

export default function Register() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [success, setSuccess] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setMsg("");
    setSuccess(false);

    const u = username.trim();
    const em = email.trim();

    if (!u) return setMsg("Username is required.");
    if (u.length < 3) return setMsg("Username must be at least 3 characters.");
    if (!/^[a-zA-Z0-9_]+$/.test(u))
      return setMsg("Username can only use letters, numbers, underscore.");
    if (!em || !password) return setMsg("Email and password are required.");
    if (password.length < 6) return setMsg("Password must be at least 6 characters.");
    if (password !== confirm) return setMsg("Passwords do not match.");

    setLoading(true);
    try {
      // ✅ Create auth user AND send username via metadata.
      // The DB trigger (handle_new_user) will upsert profiles.username from raw_user_meta_data.
      const { data, error } = await supabase.auth.signUp({
        email: em,
        password,
        options: {
          data: { username: u },
        },
      });

      if (error) throw error;

      // If email confirmation is ON, session may be null until user confirms.
      if (!data?.session) {
        setSuccess(true);
        setMsg("✅ Account created. Please check your email to verify, then sign in.");
        setTimeout(() => navigate("/login"), 1400);
        return;
      }

      // If confirmations are OFF, user is already signed in.
      setSuccess(true);
      setMsg("✅ Account created. Redirecting to sign in…");
      setTimeout(() => navigate("/login"), 800);
    } catch (err) {
      const message = err?.message || String(err);

      if (message.toLowerCase().includes("too many requests") || message.includes("429")) {
        setMsg("❌ Too many signup attempts. Please wait a bit and try again.");
      } else if (
        message.toLowerCase().includes("duplicate") ||
        message.toLowerCase().includes("unique")
      ) {
        setMsg("❌ Username already taken. Please choose another.");
      } else {
        setMsg(`❌ ${message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-page">
      <div className="register-card">
        <h1 className="register-title">StreamMova</h1>
        <p className="register-subtitle">Create your account</p>

        <form onSubmit={handleRegister} className="register-form">
          <label>Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. mpate_keakopa"
            autoComplete="username"
            disabled={loading}
          />

          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            disabled={loading}
          />

          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            disabled={loading}
          />

          <label>Confirm Password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            disabled={loading}
          />

          <button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create account"}
          </button>

          {msg ? (
            <div className={`register-msg ${success ? "success" : "error"}`}>{msg}</div>
          ) : null}
        </form>

        <div className="register-footer">
          Already have an account?{" "}
          <span className="register-link" onClick={() => navigate("/login")}>
            Sign in
          </span>
        </div>
      </div>
    </div>
  );
}
