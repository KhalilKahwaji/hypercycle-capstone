import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "", username: "", full_name: "", password: "", confirm: "",
  });
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
      <div className="card center">
        <div className="brand" style={{ fontFamily: "var(--display)", fontWeight: 900, fontSize: 30 }}>
          Create account
        </div>
        <p className="muted" style={{ marginBottom: 18 }}>
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
        <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <label>Confirm password</label>
        <input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && submit()} />

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
