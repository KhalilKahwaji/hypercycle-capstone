import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
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

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username_or_email: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
      setError(e.message);
    } finally {
      setBusy(false);
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
          HyperCycle
        </div>
        <p className="muted" style={{ marginBottom: 22, fontSize: 13 }}>
          Sign in to your self-driving bootcamp.
        </p>

        {error && <div className="alert err">{error}</div>}

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

        <button className="full" style={{ marginTop: 20 }} onClick={submit} disabled={busy}>
          {busy ? <span className="spinner" /> : "Sign in"}
        </button>

        <p className="muted" style={{ marginTop: 18, fontSize: 13, textAlign: "center" }}>
          No account? <Link to="/register">Create one</Link>
        </p>
      </div>
    </div>
  );
}
