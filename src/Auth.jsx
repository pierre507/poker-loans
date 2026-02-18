import { useState } from "react";
import { supabase } from "./supabaseClient";

const inputStyle = {
  width: "100%",
  padding: "14px 16px",
  background: "#2a2a2a",
  border: "1px solid #444",
  borderRadius: 12,
  color: "#fff",
  fontSize: 16,
  fontFamily: "'DM Sans', sans-serif",
  outline: "none",
  boxSizing: "border-box",
};

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) {
        setError(error.message);
      } else {
        setMessage("Check your email for a confirmation link!");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
      }
    }
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Enter your email first");
      return;
    }
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      setError(error.message);
    } else {
      setMessage("Password reset email sent!");
    }
    setLoading(false);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#111",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'DM Sans', sans-serif",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "#1a1a1a",
          borderRadius: 20,
          padding: 32,
          border: "1px solid #333",
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 32,
              fontWeight: 900,
              fontFamily: "'Space Mono', monospace",
              color: "#fff",
            }}
          >
            POKER<span style={{ color: "#e53935" }}>LOANS</span>
          </h1>
          <p style={{ color: "#666", fontSize: 14, marginTop: 8 }}>
            Track loans & debts with friends
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#999", fontWeight: 600 }}>
              Email
            </label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#999", fontWeight: 600 }}>
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              required
              minLength={6}
            />
          </div>

          {error && (
            <div style={{
              background: "rgba(229,57,53,0.15)", border: "1px solid rgba(229,57,53,0.3)",
              borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#e53935",
            }}>
              {error}
            </div>
          )}

          {message && (
            <div style={{
              background: "rgba(67,160,71,0.15)", border: "1px solid rgba(67,160,71,0.3)",
              borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#43A047",
            }}>
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "14px",
              background: loading ? "#555" : "linear-gradient(135deg, #e53935, #43A047)",
              border: "none",
              borderRadius: 12,
              color: "#fff",
              fontSize: 16,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "'DM Sans', sans-serif",
              marginTop: 4,
            }}
          >
            {loading ? "..." : isSignUp ? "Create Account" : "Sign In"}
          </button>

          {!isSignUp && (
            <button
              type="button"
              onClick={handleForgotPassword}
              style={{
                background: "none", border: "none", color: "#666",
                fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Forgot password?
            </button>
          )}
        </form>

        <div style={{ textAlign: "center", marginTop: 24 }}>
          <button
            onClick={() => { setIsSignUp(!isSignUp); setError(""); setMessage(""); }}
            style={{
              background: "none", border: "none", color: "#999",
              fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}
