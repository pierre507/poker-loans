import { useState } from "react";
import { supabase } from "./supabaseClient";

const inputStyle = {
  width: "100%",
  padding: "14px 16px",
  background: "#fff",
  border: "1px solid #e8e6e2",
  borderRadius: 12,
  color: "#1a1a1a",
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
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) { setError(error.message); }
      else { setMessage("Check your email for a confirmation link!"); }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError(error.message); }
    }
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!email) { setError("Enter your email first"); return; }
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) { setError(error.message); }
    else { setMessage("Password reset email sent!"); }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#f8f7f5",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans', sans-serif", padding: 20,
    }}>
      <div style={{
        width: "100%", maxWidth: 400, background: "#fff",
        borderRadius: 20, padding: 32, border: "1px solid #e8e6e2",
      }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 500, color: "#1a1a1a" }}>
            poker <span style={{ color: "#2e7d32" }}>manager</span>
          </h1>
          <p style={{ color: "#aaa", fontSize: 14, marginTop: 8 }}>
            Track your bankroll, loans & debts
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#888", fontWeight: 500 }}>Email</label>
            <input type="email" placeholder="you@example.com" value={email}
              onChange={(e) => setEmail(e.target.value)} style={inputStyle} required />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#888", fontWeight: 500 }}>Password</label>
            <input type="password" placeholder="••••••••" value={password}
              onChange={(e) => setPassword(e.target.value)} style={inputStyle} required minLength={6} />
          </div>

          {error && (
            <div style={{ background: "#fce8e8", border: "1px solid #f5c6c6", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#c62828" }}>
              {error}
            </div>
          )}
          {message && (
            <div style={{ background: "#e8f5e9", border: "1px solid #c8e6c9", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#2e7d32" }}>
              {message}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            padding: "14px", background: loading ? "#e8e6e2" : "#2e7d32",
            border: "none", borderRadius: 12, color: "#fff", fontSize: 16, fontWeight: 500,
            cursor: loading ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif", marginTop: 4,
          }}>
            {loading ? "..." : isSignUp ? "Create Account" : "Sign In"}
          </button>

          {!isSignUp && (
            <button type="button" onClick={handleForgotPassword} style={{
              background: "none", border: "none", color: "#aaa", fontSize: 13,
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            }}>
              Forgot password?
            </button>
          )}
        </form>

        <div style={{ textAlign: "center", marginTop: 24 }}>
          <button onClick={() => { setIsSignUp(!isSignUp); setError(""); setMessage(""); }} style={{
            background: "none", border: "none", color: "#888", fontSize: 14,
            cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
          }}>
            {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}
