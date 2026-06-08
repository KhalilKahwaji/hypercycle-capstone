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

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "", username: "", full_name: "", password: "", confirm: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    if (!form.email.trim() || !form.username.trim() || !form.full_name.trim()) {
      setError("Email, username, and full name are required.");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (form.password !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await register({
        email: form.email.trim(),
        username: form.username.trim(),
        full_name: form.full_name.trim(),
        password: form.password,
      });
      navigate("/assessment");
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
          marginBottom: 4,
          background: "linear-gradient(135deg, var(--text) 30%, var(--amber) 80%, var(--cyan) 120%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}>
          HyperCycle
        </div>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6, color: "var(--text)" }}>
          Create account
        </div>
        <p className="muted" style={{ marginBottom: 22, fontSize: 13 }}>
          Then we'll assess you and build your program.
        </p>

        {error && <div className="alert err">{error}</div>}

        <label>Email</label>
        <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />

        <label>Username</label>
        <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />

        <label>Full name</label>
        <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />

        <label>Password</label>
        <div className="pw-wrap">
          <input
            type={showPw ? "text" : "password"}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <button type="button" className="pw-toggle" onClick={() => setShowPw((v) => !v)} tabIndex={-1}>
            <EyeIcon open={showPw} />
          </button>
        </div>

        <label>Confirm password</label>
        <div className="pw-wrap">
          <input
            type={showConfirm ? "text" : "password"}
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <button type="button" className="pw-toggle" onClick={() => setShowConfirm((v) => !v)} tabIndex={-1}>
            <EyeIcon open={showConfirm} />
          </button>
        </div>

        <button className="full" style={{ marginTop: 20 }} onClick={submit} disabled={busy}>
          {busy ? <span className="spinner" /> : "Create account"}
        </button>

        <p className="muted" style={{ marginTop: 18, fontSize: 13, textAlign: "center" }}>
          Already have one? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
