import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GitBranch, Upload, X, ChevronRight, Zap } from "lucide-react";
import client from "../api/client";

const LEVELS = ["beginner", "intermediate", "advanced"];

function LevelPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", textAlign: "left",
          background: "rgba(255,255,255,0.03)",
          border: `1px solid ${open ? "var(--amber)" : "var(--border)"}`,
          borderRadius: "var(--radius-sm)",
          padding: "11px 36px 11px 13px",
          color: "var(--text)",
          fontFamily: "var(--mono)", fontSize: 14, cursor: "pointer",
          boxShadow: open ? "0 0 0 3px rgba(139,124,255,0.14)" : "none",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        <span>{value}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" style={{ opacity: 0.5, flexShrink: 0 }}>
          <path d="M2 4l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
          background: "var(--panel-solid, #13141f)",
          border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
          overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
        }}>
          {LEVELS.map((l) => (
            <div key={l} onMouseDown={() => { onChange(l); setOpen(false); }}
              style={{
                padding: "10px 13px", fontFamily: "var(--mono)", fontSize: 14, cursor: "pointer",
                color: l === value ? "var(--amber)" : "var(--text)",
                background: l === value ? "rgba(255,255,255,0.06)" : "transparent",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = l === value ? "rgba(255,255,255,0.06)" : "transparent"; }}
            >{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function StepDot({ n, active, done }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 700,
        background: done ? "var(--amber)" : active ? "rgba(139,124,255,0.25)" : "rgba(255,255,255,0.05)",
        border: `1.5px solid ${done ? "var(--amber)" : active ? "var(--purple, #8b7cff)" : "var(--border)"}`,
        color: done ? "#000" : active ? "var(--purple, #8b7cff)" : "var(--faint)",
        transition: "all 0.2s",
      }}>{done ? "✓" : n}</div>
      <span style={{
        fontSize: 12, color: active ? "var(--text)" : "var(--faint)",
        fontWeight: active ? 600 : 400,
      }}>
        {n === 1 ? "Core profile" : "Personalize"}
      </span>
    </div>
  );
}

function OptionalBadge() {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, letterSpacing: "0.8px",
      padding: "2px 7px", borderRadius: 20,
      background: "rgba(77,208,255,0.1)", color: "var(--cyan, #4dd0ff)",
      border: "1px solid rgba(77,208,255,0.2)", textTransform: "uppercase",
      marginLeft: 8, verticalAlign: "middle",
    }}>optional</span>
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [step, setStep] = useState(1);
  const [core, setCore] = useState({
    known_languages: "",
    experience_level: "beginner",
    goals: "",
    background: "",
    hours_per_week: 20,
    age: "",
  });
  const [optional, setOptional] = useState({
    github_username: "",
    preferred_learning_style: "",
    focus_area: "",
    target_outcome: "",
    prior_experience_notes: "",
  });
  const [cvFile, setCvFile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // If the user already has a program, go to dashboard
    client.get("/programs/me")
      .then((r) => { if (r.data.program) navigate("/dashboard", { replace: true }); })
      .catch(() => {});
  }, []);

  const setOpt = (k, v) => setOptional((o) => ({ ...o, [k]: v }));

  const validateStep1 = () => {
    if (!core.goals.trim()) { setError("Tell us your goals — this drives the whole program."); return false; }
    const ageNum = Number(core.age);
    if (!core.age || ageNum < 10 || ageNum > 100) { setError("Enter a valid age (10–100)."); return false; }
    return true;
  };

  const handleNext = () => {
    setError("");
    if (validateStep1()) setStep(2);
  };

  const generate = async (skipOptional = false) => {
    setError("");
    setBusy(true);
    try {
      await client.post("/assessments", {
        ...core,
        hours_per_week: Number(core.hours_per_week),
        age: Number(core.age),
      });

      if (!skipOptional) {
        const hasOpt = cvFile || Object.values(optional).some((v) => v.trim());
        if (hasOpt) {
          const fd = new FormData();
          if (cvFile) fd.append("cv_file", cvFile);
          Object.entries(optional).forEach(([k, v]) => { if (v.trim()) fd.append(k, v.trim()); });
          await client.post("/onboarding", fd);
        }
      }

      await client.post("/programs/generate");
      navigate("/program");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCvChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.split(".").pop().toLowerCase();
    if (!["pdf", "txt", "md"].includes(ext)) {
      setError("CV must be a PDF, TXT, or MD file.");
      return;
    }
    if (f.size > 5 * 1024 * 1024) { setError("CV file must be under 5 MB."); return; }
    setError("");
    setCvFile(f);
  };

  return (
    <div className="center-screen" style={{ alignItems: "flex-start", paddingTop: 48, paddingBottom: 48 }}>
      <div style={{ width: "100%", maxWidth: 560, margin: "0 auto", padding: "0 16px" }}>

        {/* Step indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <StepDot n={1} active={step === 1} done={step > 1} />
          <div style={{ flex: 1, height: 1, background: step > 1 ? "var(--amber)" : "var(--border)", transition: "background 0.3s" }} />
          <StepDot n={2} active={step === 2} done={false} />
        </div>

        {error && <div className="alert err" style={{ marginBottom: 16 }}>{error}</div>}

        {/* ── Step 1: Core profile ── */}
        {step === 1 && (
          <div className="card">
            <h1 className="page-title" style={{ marginBottom: 4 }}>Build your profile</h1>
            <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
              This drives your entire 16-day program. Be honest.
            </p>

            <label>What languages / tools do you already know?</label>
            <input
              placeholder="e.g. Python, some JavaScript, basic SQL"
              value={core.known_languages}
              onChange={(e) => setCore({ ...core, known_languages: e.target.value })}
            />

            <label>Experience level</label>
            <LevelPicker value={core.experience_level} onChange={(l) => setCore({ ...core, experience_level: l })} />

            <label>What do you want to learn or build? <span style={{ color: "var(--amber)" }}>*</span></label>
            <textarea
              placeholder="e.g. I want to build and deploy full-stack AI apps with React + FastAPI, learn RAG, and ship a real product."
              value={core.goals}
              onChange={(e) => setCore({ ...core, goals: e.target.value })}
            />

            <label>Your background</label>
            <input
              placeholder="e.g. CS student / career switcher from marketing"
              value={core.background}
              onChange={(e) => setCore({ ...core, background: e.target.value })}
            />

            <label>Age <span style={{ color: "var(--amber)" }}>*</span></label>
            <input
              type="number" min="10" max="100" placeholder="e.g. 22"
              value={core.age}
              onChange={(e) => setCore({ ...core, age: e.target.value })}
            />

            <label>Hours available per week</label>
            <input
              type="number" min="1" max="80"
              value={core.hours_per_week}
              onChange={(e) => setCore({ ...core, hours_per_week: e.target.value })}
            />

            <button className="full" style={{ marginTop: 22 }} onClick={handleNext}>
              Next <ChevronRight size={15} style={{ display: "inline", verticalAlign: "middle", marginLeft: 4 }} />
            </button>
          </div>
        )}

        {/* ── Step 2: Optional enrichment ── */}
        {step === 2 && (
          <div className="card">
            <h1 className="page-title" style={{ marginBottom: 4 }}>Personalize further</h1>
            <p className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
              All fields below are completely optional. They help the AI calibrate your program with higher precision —
              but your program works great without them.
            </p>
            <div style={{ marginBottom: 20, padding: "10px 14px", borderRadius: "var(--radius-sm)", background: "rgba(77,208,255,0.06)", border: "1px solid rgba(77,208,255,0.18)", fontSize: 13, color: "var(--cyan, #4dd0ff)" }}>
              Skip any or all of these — hit "Skip &amp; generate" below to proceed immediately.
            </div>

            {/* GitHub */}
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <GitBranch size={14} style={{ opacity: 0.7 }} /> GitHub username <OptionalBadge />
            </label>
            <input
              placeholder="e.g. khalilkahwaji"
              value={optional.github_username}
              onChange={(e) => setOpt("github_username", e.target.value)}
            />
            <p className="muted" style={{ fontSize: 12, marginTop: -8, marginBottom: 12 }}>
              Public profile only — no OAuth, no private repos.
            </p>

            {/* CV upload */}
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Upload size={14} style={{ opacity: 0.7 }} /> CV / Résumé <OptionalBadge />
            </label>
            <input ref={fileRef} type="file" accept=".pdf,.txt,.md" style={{ display: "none" }} onChange={handleCvChange} />
            {cvFile ? (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px", borderRadius: "var(--radius-sm)",
                background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)",
                marginBottom: 16,
              }}>
                <span style={{ fontSize: 13, color: "var(--text)", wordBreak: "break-all" }}>{cvFile.name}</span>
                <button type="button" onClick={() => { setCvFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4, lineHeight: 1 }}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                style={{
                  width: "100%", padding: "11px 14px", marginBottom: 16,
                  background: "rgba(255,255,255,0.03)", border: "1px dashed var(--border)",
                  borderRadius: "var(--radius-sm)", color: "var(--muted)", cursor: "pointer",
                  fontSize: 13, textAlign: "left",
                }}
              >
                Click to upload PDF, TXT, or MD — max 5 MB
              </button>
            )}

            {/* Preferred learning style */}
            <label>Preferred learning style <OptionalBadge /></label>
            <input
              placeholder="e.g. hands-on projects, reading then building, guided steps"
              value={optional.preferred_learning_style}
              onChange={(e) => setOpt("preferred_learning_style", e.target.value)}
            />

            {/* Focus area */}
            <label>What do you most want to focus on or build? <OptionalBadge /></label>
            <textarea
              placeholder="e.g. I'm mainly interested in NLP and want to build a chatbot product."
              value={optional.focus_area}
              onChange={(e) => setOpt("focus_area", e.target.value)}
              style={{ minHeight: 72 }}
            />

            {/* Target outcome */}
            <label>What does success look like for you? <OptionalBadge /></label>
            <input
              placeholder="e.g. Land a junior ML engineer role in 3 months."
              value={optional.target_outcome}
              onChange={(e) => setOpt("target_outcome", e.target.value)}
            />

            {/* Prior experience notes */}
            <label>Anything else about your background? <OptionalBadge /></label>
            <textarea
              placeholder="e.g. I took Andrew Ng's ML course, built a few toy models, but never shipped anything to production."
              value={optional.prior_experience_notes}
              onChange={(e) => setOpt("prior_experience_notes", e.target.value)}
              style={{ minHeight: 72 }}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <button
                className="ghost"
                onClick={() => generate(true)}
                disabled={busy}
                style={{ flex: 1 }}
              >
                Skip &amp; generate
              </button>
              <button
                onClick={() => generate(false)}
                disabled={busy}
                style={{ flex: 2 }}
              >
                {busy
                  ? <><span className="spinner" />&nbsp; Generating program…</>
                  : <><Zap size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />Generate my program</>
                }
              </button>
            </div>

            <button
              type="button" onClick={() => setStep(1)}
              style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12, marginTop: 12, padding: 0 }}
            >
              ← Back to profile
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
