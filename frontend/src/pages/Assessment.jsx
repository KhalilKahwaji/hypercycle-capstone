import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";

const LEVELS = ["beginner", "intermediate", "advanced"];

export default function Assessment() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    known_languages: "",
    experience_level: "beginner",
    goals: "",
    background: "",
    hours_per_week: 20,
    age: "",
  });
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasProgram, setHasProgram] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    client.get("/assessments/me").then((r) => {
      if (r.data.assessment) setForm((f) => ({ ...f, ...r.data.assessment }));
    });
    client.get("/programs/me").then((r) => setHasProgram(!!r.data.program));
  }, []);

  const validate = () => {
    setError(""); setMsg("");
    if (!form.goals.trim()) {
      setError("Tell us your goals — this drives the whole program.");
      return false;
    }
    const ageNum = Number(form.age);
    if (!form.age || ageNum < 10 || ageNum > 100) {
      setError("Enter a valid age (10–100).");
      return false;
    }
    return true;
  };

  const handleSubmitClick = () => {
    if (!validate()) return;
    if (hasProgram) {
      setShowConfirm(true);
    } else {
      saveAndGenerate();
    }
  };

  const saveAndGenerate = async () => {
    setShowConfirm(false);
    setBusy(true);
    try {
      await client.post("/assessments", {
        ...form,
        hours_per_week: Number(form.hours_per_week),
        age: Number(form.age),
      });
      setMsg("Assessment saved. Generating your personalized 16-day program…");
      await client.post("/programs/generate");
      navigate("/program");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Self-Assessment</h1>
      <p className="page-sub">
        Be honest — the LLM builds a program tailored to exactly where you are.
      </p>

      {hasProgram && (
        <div className="alert info">
          You already have a program. Saving this again will <b>regenerate</b> it from scratch.
        </div>
      )}
      {error && <div className="alert err">{error}</div>}
      {msg && <div className="alert ok">{msg}</div>}

      <div className="card">
        <label>What languages / tools do you already know?</label>
        <input
          placeholder="e.g. Python, some JavaScript, basic SQL"
          value={form.known_languages}
          onChange={(e) => setForm({ ...form, known_languages: e.target.value })}
        />

        <label>Experience level</label>
        <select
          value={form.experience_level}
          onChange={(e) => setForm({ ...form, experience_level: e.target.value })}
        >
          {LEVELS.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>

        <label>What do you want to learn or build? (goals)</label>
        <textarea
          placeholder="e.g. I want to build and deploy full-stack AI apps with React + FastAPI, learn RAG, and ship a real product."
          value={form.goals}
          onChange={(e) => setForm({ ...form, goals: e.target.value })}
        />

        <label>Your background</label>
        <input
          placeholder="e.g. CS student / career switcher from marketing"
          value={form.background}
          onChange={(e) => setForm({ ...form, background: e.target.value })}
        />

        <label>Age</label>
        <input
          type="number" min="10" max="100"
          placeholder="e.g. 22"
          value={form.age}
          onChange={(e) => setForm({ ...form, age: e.target.value })}
        />

        <label>Hours available per week</label>
        <input
          type="number" min="1" max="80"
          value={form.hours_per_week}
          onChange={(e) => setForm({ ...form, hours_per_week: e.target.value })}
        />

        <button className="full" style={{ marginTop: 22 }} onClick={handleSubmitClick} disabled={busy}>
          {busy ? <><span className="spinner" /> &nbsp;Generating program…</> : "Save & generate my program"}
        </button>
      </div>

      {showConfirm && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
          }}
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="card"
            style={{ maxWidth: 420, width: "90%", textAlign: "center" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 28, color: "#e74c3c", marginBottom: 10, fontWeight: 700 }}>
              Delete all progress?
            </div>
            <p className="muted" style={{ marginBottom: 8, fontSize: 14 }}>
              Regenerating your program will permanently erase:
            </p>
            <ul style={{ textAlign: "left", color: "var(--muted)", fontSize: 13, marginBottom: 20, paddingLeft: 20 }}>
              <li>All completed days</li>
              <li>All submissions</li>
              <li>All feedback</li>
            </ul>
            <p className="muted" style={{ marginBottom: 20, fontSize: 13 }}>
              This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button className="ghost" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button
                style={{ background: "#c0392b", borderColor: "#c0392b" }}
                onClick={saveAndGenerate}
              >
                Yes, delete &amp; regenerate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
