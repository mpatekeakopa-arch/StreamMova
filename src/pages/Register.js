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
      const redirectTo = `${window.location.origin}/login`;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username: u },          // goes into raw_user_meta_data.username
          emailRedirectTo: redirectTo     // ensures confirm link returns to your site
        }
      });

      if (error) throw error;

      // If email confirmation is ON, session may be null and that's OK.
      // Profile is created by DB trigger after user row exists.
      if (!data?.session) {
        setMsg("✅ Account created. Check your email to confirm, then sign in.");
        setTimeout(() => navigate("/login"), 1200);
        return;
      }

      // If email confirmation is OFF, you get a session immediately.
      setMsg("✅ Account created. Redirecting...");
      setTimeout(() => navigate("/dashboard"), 800);

    } catch (err) {
      const message = err?.message || String(err);

      if (message.toLowerCase().includes("rate limit")) {
        setMsg("❌ Too many signup attempts. Please wait a few minutes and try again.");
      } else if (message.toLowerCase().includes("username") && message.toLowerCase().includes("duplicate")) {
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
