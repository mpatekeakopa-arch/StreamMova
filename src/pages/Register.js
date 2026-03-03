import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import "./register.css";

export default function Register() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();
    setMsg("");

    if (!email || !password) return setMsg("Email and password are required.");
    if (password.length < 6) return setMsg("Password must be at least 6 characters.");
    if (password !== confirm) return setMsg("Passwords do not match.");

    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;

      setMsg("✅ Account created. Check your email for confirmation (if enabled). Then sign in.");
      setTimeout(() => navigate("/login"), 1200);
    } catch (err) {
      setMsg(`❌ ${err?.message || String(err)}`);
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
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />

          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
          />

          <label>Confirm Password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
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
