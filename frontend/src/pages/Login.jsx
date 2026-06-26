import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import client from "../api/client";
import NeuralBg from "../components/NeuralBg";

function EyeIcon({ open }) {
  return open ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username_or_email: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ghBusy, setGhBusy] = useState(false);

  const submit = async () => {
    setError("");
    if (!form.username_or_email.trim() || !form.password) {
      setError("Enter your username/email and password.");
      return;
    }
    setBusy(true);
    try {
      const data = await login(form.username_or_email.trim(), form.password);
      sessionStorage.setItem("sensei_pending_event", "login");
      navigate(data.user?.is_admin ? "/admin" : "/dashboard");
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setBusy(false);
    }
  };

  const loginWithGitHub = async () => {
    setError("");
    setGhBusy(true);
    try {
      const res = await client.get("/auth/github/login-start");
      window.location.href = res.data.auth_url;
    } catch (e) {
      setError("Could not start GitHub sign-in. Please try again.");
      setGhBusy(false);
    }
  };

  return (
    <div className="center-screen">
      <NeuralBg />

      <div className="card center" style={{ position: "relative", zIndex: 2 }}>
        <div style={{
          fontFamily: "var(--display)",
          fontWeight: 900,
          fontSize: 44,
          letterSpacing: "-1.5px",
          lineHeight: 1,
          marginBottom: 8,
          background: "linear-gradient(135deg, var(--text) 30%, var(--amber) 80%, var(--cyan) 120%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}>
          AI Buddy
        </div>
        <p className="muted" style={{ marginBottom: 22, fontSize: 13 }}>
          Sign in to your self-driving bootcamp.
        </p>

        {error && <div className="alert err">{error}</div>}

        {/* GitHub sign-in */}
        <button
          className="full"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.14)",
            color: "var(--text)",
            marginBottom: 4,
          }}
          onClick={loginWithGitHub}
          disabled={ghBusy || busy}
        >
          {ghBusy ? <span className="spinner" /> : <GitHubIcon />}
          {ghBusy ? "Redirecting…" : "Sign in with GitHub"}
        </button>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "14px 0" }}>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
          <span className="muted" style={{ fontSize: 11, letterSpacing: 1 }}>OR</span>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
        </div>

        <label>Username or email</label>
        <input
          value={form.username_or_email}
          onChange={(e) => setForm({ ...form, username_or_email: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />

        <label>Password</label>
        <div className="pw-wrap">
          <input
            type={showPw ? "text" : "password"}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <button type="button" className="pw-toggle" onClick={() => setShowPw((v) => !v)} tabIndex={-1}>
            <EyeIcon open={showPw} />
          </button>
        </div>

        <button className="full" style={{ marginTop: 20 }} onClick={submit} disabled={busy || ghBusy}>
          {busy ? <span className="spinner" /> : "Sign in"}
        </button>

        <p className="muted" style={{ marginTop: 18, fontSize: 13, textAlign: "center" }}>
          No account? <Link to="/register">Create one</Link>
        </p>
      </div>
    </div>
  );
}
