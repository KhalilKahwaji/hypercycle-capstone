import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username_or_email: "", password: "" });
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
      navigate(data.user?.is_admin ? "/admin" : "/dashboard");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-screen">
      <div className="card center">
        <div className="brand" style={{ fontFamily: "var(--display)", fontWeight: 900, fontSize: 30 }}>
          Hyper<span style={{ color: "var(--amber)" }}>Cycle</span>
        </div>
        <p className="muted" style={{ marginBottom: 18 }}>
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
        <input
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />

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
