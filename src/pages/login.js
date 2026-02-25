import React, { useState, useCallback } from "react";
import "./login.css";

const BACKEND_URL = "http://127.0.0.1:5000";

export default function Login() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Helper for safe API calls to backend
  const safePost = useCallback(async (path, payload) => {
    try {
      const response = await fetch(`${BACKEND_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return await response.json();
    } catch (error) {
      console.error(`Error posting to ${path}:`, error);
      return null;
    }
  }, []);

  // Log login attempts
  const logLogin = useCallback(async ({ auth_user_id, provider, success, failure_reason }) => {
    await safePost("/api/auth/logins", {
      auth_user_id: auth_user_id || null,
      provider,
      success,
      failure_reason,
    });
  }, [safePost]);

  // Create or update user in database
  const upsertUser = useCallback(async ({ auth_user_id, email, display_name, avatar_url }) => {
    await safePost("/api/users/upsert", {
      auth_user_id,
      email,
      display_name,
      avatar_url,
    });
  }, [safePost]);

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
      // Direct API call to your backend
      const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      
      const response = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          ...(mode === "signup" && { name: displayName.trim() })
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.message || "Authentication failed";
        setError(errorMsg);
        
        // Log failed login
        await logLogin({
          auth_user_id: null,
          provider: "email",
          success: false,
          failure_reason: errorMsg,
        });
        return;
      }

      // Extract user from response (handles different response structures)
      const user = data.user || data.data?.user || data;
      
      if (!user?.id) {
        const msg = mode === "signup" 
          ? "Account created. Please check your email to verify."
          : "Login successful but user data incomplete.";
        
        setError(msg);
        
        await logLogin({
          auth_user_id: null,
          provider: "email",
          success: mode !== "signup",
          failure_reason: mode === "signup" ? "verification_required" : msg,
        });
        
        if (mode === "signup") {
          // Don't redirect on signup if verification is needed
          setLoading(false);
          return;
        }
      }

      // Success! Upsert user and log login
      if (user?.id) {
        await upsertUser({
          auth_user_id: user.id,
          email: user.email || email,
          display_name: user.name || displayName || null,
          avatar_url: user.avatar_url || user.image || null,
        });

        await logLogin({
          auth_user_id: user.id,
          provider: "email",
          success: true,
        });

        // Store user data
        localStorage.setItem("user", JSON.stringify(user));
        
        // Redirect to dashboard
        window.location.href = "/dashboard";
      }
      
    } catch (err) {
      const errorMsg = err.message || "Authentication failed";
      setError(errorMsg);
      
      await logLogin({
        auth_user_id: null,
        provider: "email",
        success: false,
        failure_reason: errorMsg,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setLoading(true);

    try {
      console.log("Starting Google sign-in...");
      console.log("BACKEND_URL =", BACKEND_URL);
      
      // Store current path to return after Google login
      localStorage.setItem("redirectAfterLogin", "/dashboard");
      
      // Redirect to your backend Google OAuth
      window.location.href = `${BACKEND_URL}/api/auth/google`;
      
    } catch (err) {
      console.error("Google sign-in error:", err);
      setError(err.message || "Google sign-in failed");
      setLoading(false);
    }
  };

  // Check for Google OAuth redirect response
  React.useEffect(() => {
    // Check if we have a user in the URL (for OAuth redirects)
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const userData = urlParams.get('user');
    
    if (token && userData) {
      try {
        const user = JSON.parse(decodeURIComponent(userData));
        
        // Process the OAuth login
        const processOAuthLogin = async () => {
          await upsertUser({
            auth_user_id: user.id,
            email: user.email,
            display_name: user.name,
            avatar_url: user.avatar_url,
          });
          
          await logLogin({
            auth_user_id: user.id,
            provider: "google",
            success: true,
          });
          
          localStorage.setItem("user", JSON.stringify(user));
          localStorage.setItem("token", token);
          
          // Clean URL
          window.history.replaceState({}, document.title, "/login");
          
          // Redirect to dashboard
          window.location.href = "/dashboard";
        };
        
        processOAuthLogin();
      } catch (error) {
        console.error("Error processing OAuth login:", error);
      }
    }
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
                disabled={loading}
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
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              disabled={loading}
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
          className="google-btn" 
          onClick={handleGoogle} 
          disabled={loading}
          type="button"
        >
          <img
            src="https://developers.google.com/identity/images/g-logo.png"
            alt="Google"
            className="google-icon"
          />
          Log in with Google
        </button>

        <div className="login-footer">
          {mode === "signin" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError("");
                }}
                className="link-btn"
                disabled={loading}
              >
                Create account
              </button>
              <span className="separator">•</span>
              <a href="/forgot-password" className="link-btn">
                Forgot password?
              </a>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError("");
              }}
              className="link-btn"
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