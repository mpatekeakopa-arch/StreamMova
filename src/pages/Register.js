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

  const handleRegister = async (e) => {
    e.preventDefault();
    setMsg("");

    const u = username.trim();

    if (!u) return setMsg("Username is required.");
    if (u.length < 3) return setMsg("Username must be at least 3 characters.");
    if (!/^[a-zA-Z0-9_]+$/.test(u)) return setMsg("Username can only use letters, numbers, underscore.");
    if (!email || !password) return setMsg("Email and password are required.");
    if (password.length < 6) return setMsg("Password must be at least 6 characters.");
    if (password !== confirm) return setMsg("Passwords do not match.");

    setLoading(true);
    try {
      // IMPORTANT:
      // - Put username in user_metadata so the DB trigger can create profiles row.
      // - emailRedirectTo must match your Supabase Auth settings allow-list.
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
         
          emailRedirectTo: "https://app.streammova.xyz/login",
        },
      });

      if (error) throw error;

      // If confirmation required => no session. That's fine.
      setMsg("✅ Account created. Please check your email to confirm, then sign in.");
      setTimeout(() => navigate("/login"), 1200);
    } catch (err) {
      const message = err?.message || String(err);
      if (message.toLowerCase().includes("rate limit") || message.includes("429")) {
        setMsg("❌ Too many attempts. Please wait a bit and try again.");
      } else if (message.toLowerCase().includes("user already registered")) {
        setMsg("❌ This email is already registered. Try signing in.");
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

          {msg ? <div className="register-msg">{msg}</div> : null}
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
