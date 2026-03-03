import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import "./register.css";

export default function Register() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();
    setMsg("");

    const u = username.trim();
    const dn = displayName.trim();

    if (!u) return setMsg("Username is required.");
    if (u.length < 3) return setMsg("Username must be at least 3 characters.");
    if (!/^[a-zA-Z0-9_]+$/.test(u)) return setMsg("Username can only use letters, numbers, underscore.");
    if (!email || !password) return setMsg("Email and password are required.");
    if (password.length < 6) return setMsg("Password must be at least 6 characters.");
    if (password !== confirm) return setMsg("Passwords do not match.");

    setLoading(true);
    try {
      // 1) Create auth user
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;

      const userId = data?.user?.id;
      if (!userId) {
        setMsg("✅ Account created. Please check your email to confirm, then sign in.");
        setTimeout(() => navigate("/login"), 1200);
        return;
      }

      // 2) Insert profile row (username/display_name)
      const { error: profileErr } = await supabase.from("profiles").insert({
        id: userId,
        username: u,
        display_name: dn || null,
      });

      if (profileErr) {
        // If username is duplicate, Supabase will return a constraint error
        throw profileErr;
      }

      setMsg("✅ Account created. Check your email for confirmation (if enabled). Then sign in.");
      setTimeout(() => navigate("/login"), 1200);
    } catch (err) {
      const message = err?.message || String(err);

      // Friendly message for duplicate username
      if (message.toLowerCase().includes("duplicate") || message.toLowerCase().includes("unique")) {
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

          <label>Display name (optional)</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
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
