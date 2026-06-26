import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GitBranch, Upload, X, ChevronRight, Zap } from "lucide-react";
import client from "../api/client";

const LEVELS = ["beginner", "intermediate", "advanced"];

// ── LevelPicker ──────────────────────────────────────────────────────────────
function LevelPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
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
          transform: "none", letterSpacing: 0, fontWeight: "normal",
        }}
      >
        <span>{value}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round"
          style={{
            opacity: 0.5, flexShrink: 0,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.2s",
          }}>
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
            <div key={l}
              onMouseDown={() => { onChange(l); setOpen(false); }}
              style={{
                padding: "10px 13px", fontFamily: "var(--mono)", fontSize: 14, cursor: "pointer",
                color: l === value ? "var(--amber)" : "var(--text)",
                background: l === value ? "rgba(255,255,255,0.06)" : "transparent",
                transition: "background 0.1s",
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

// ── Opt badge ────────────────────────────────────────────────────────────────
function OptBadge() {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.8px",
      padding: "2px 7px", borderRadius: 20,
      background: "rgba(77,208,255,0.1)", color: "var(--cyan, #4dd0ff)",
      border: "1px solid rgba(77,208,255,0.2)", textTransform: "uppercase", marginLeft: 8,
    }}>optional</span>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function Onboarding() {
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [step, setStep] = useState(1);
  const [fade, setFade] = useState(true);
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
    client.get("/programs/me")
      .then((r) => { if (r.data.program) navigate("/dashboard", { replace: true }); })
      .catch(() => {});
  }, []);

  const setOpt = (k, v) => setOptional((o) => ({ ...o, [k]: v }));

  const goStep = (n) => {
    setFade(false);
    setError("");
    setTimeout(() => { setStep(n); setFade(true); }, 160);
  };

  const validateStep1 = () => {
    if (!core.goals.trim()) { setError("Tell us your goals — this drives the whole program."); return false; }
    const ageNum = Number(core.age);
    if (!core.age || ageNum < 10 || ageNum > 100) { setError("Enter a valid age (10–100)."); return false; }
    return true;
  };

  const handleNext = () => {
    setError("");
    if (validateStep1()) goStep(2);
  };

  const generate = async (skipOptional = false) => {
    setError("");
    setBusy(true);
    try {
      await client.post("/assessments", {
        ...core,
        hours_per_week: Math.max(1, Number(core.hours_per_week) || 20),
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
    if (!["pdf", "txt", "md"].includes(ext)) { setError("CV must be a PDF, TXT, or MD file."); return; }
    if (f.size > 5 * 1024 * 1024) { setError("CV file must be under 5 MB."); return; }
    setError("");
    setCvFile(f);
  };

  // Shared heading style
  const headingGrad = (colors) => ({
    fontFamily: "var(--display)", fontWeight: 900, fontSize: 26,
    letterSpacing: "-0.6px", marginBottom: 6, lineHeight: 1.1,
    background: colors,
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
  });

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "44px 20px 80px",
      position: "relative",
    }}>
      {/* Ambient scan line */}
      <div className="auth-scan" />

      {/* ── Brand header ────────────────────────────────────── */}
      <div className="fade-in" style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{
          fontFamily: "var(--display)", fontWeight: 900, fontSize: 32,
          letterSpacing: "-0.8px", marginBottom: 4,
          background: "linear-gradient(135deg, var(--text) 20%, var(--amber) 80%, var(--cyan) 120%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
        }}>HyperCycle</div>
        <div style={{ fontSize: 10, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "2.5px" }}>
          self-driving bootcamp
        </div>
      </div>

      {/* ── Step indicator ──────────────────────────────────── */}
      <div className="fade-in-1" style={{
        display: "flex",
        alignItems: "flex-start",
        width: "100%",
        maxWidth: 480,
        marginBottom: 24,
      }}>
        {/* Step 1 dot */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 700, fontFamily: "var(--mono)",
            background: step > 1 ? "var(--amber)" : "rgba(139,124,255,0.18)",
            border: `2px solid ${step > 1 ? "var(--amber)" : "var(--amber)"}`,
            color: step > 1 ? "#0a0b0f" : "var(--amber)",
            transition: "all 0.3s var(--ease)",
            boxShadow: step === 1 ? "0 0 20px rgba(139,124,255,0.35)" : "none",
          }}>
            {step > 1 ? "✓" : "1"}
          </div>
          <span style={{
            marginTop: 6, fontSize: 10, letterSpacing: "0.5px",
            color: step === 1 ? "var(--text)" : "var(--amber)",
            fontWeight: step === 1 ? 600 : 500,
            transition: "color 0.3s",
          }}>Core profile</span>
        </div>

        {/* Connecting line */}
        <div style={{ flex: 1, paddingTop: 16, paddingLeft: 10, paddingRight: 10 }}>
          <div style={{
            height: 2, borderRadius: 99,
            background: step > 1
              ? "linear-gradient(90deg, var(--amber), var(--cyan))"
              : "var(--border)",
            transition: "background 0.5s ease",
          }} />
        </div>

        {/* Step 2 dot */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 700, fontFamily: "var(--mono)",
            background: step === 2 ? "rgba(77,208,255,0.15)" : "rgba(255,255,255,0.04)",
            border: `2px solid ${step === 2 ? "var(--cyan, #4dd0ff)" : "var(--border)"}`,
            color: step === 2 ? "var(--cyan, #4dd0ff)" : "var(--faint)",
            transition: "all 0.3s var(--ease)",
            boxShadow: step === 2 ? "0 0 20px rgba(77,208,255,0.25)" : "none",
          }}>
            2
          </div>
          <span style={{
            marginTop: 6, fontSize: 10, letterSpacing: "0.5px",
            color: step === 2 ? "var(--text)" : "var(--faint)",
            fontWeight: step === 2 ? 600 : 400,
            transition: "color 0.3s",
          }}>Personalize</span>
        </div>
      </div>

      {/* ── Error ───────────────────────────────────────────── */}
      {error && (
        <div className="alert err" style={{ width: "100%", maxWidth: 480, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* ── Form card ───────────────────────────────────────── */}
      <div style={{
        width: "100%", maxWidth: 480,
        opacity: fade ? 1 : 0,
        transform: fade ? "translateY(0)" : "translateY(10px)",
        transition: "opacity 0.16s ease, transform 0.16s ease",
      }}>
        <div style={{
          background: "rgba(13,15,24,0.88)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.05)",
          overflow: "hidden",
        }}>
          {/* Gradient top bar */}
          <div style={{
            height: 3,
            background: step === 1
              ? "linear-gradient(90deg, var(--amber-dim) 0%, var(--amber) 60%, rgba(77,208,255,0.4) 100%)"
              : "linear-gradient(90deg, var(--amber) 0%, var(--cyan) 100%)",
            transition: "background 0.5s ease",
          }} />

          <div style={{ padding: "28px 28px 28px" }}>

            {/* ═══════════ STEP 1 ═══════════ */}
            {step === 1 && (
              <>
                <div style={{ marginBottom: 22 }}>
                  <h1 style={headingGrad("linear-gradient(135deg, var(--text) 30%, var(--amber) 120%)")}>
                    Build your profile
                  </h1>
                  <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
                    The AI reads this closely to design your 16-day program. Be specific.
                  </p>
                </div>

                <label>Languages &amp; tools you know</label>
                <input
                  placeholder="e.g. Python, some JavaScript, basic SQL"
                  value={core.known_languages}
                  onChange={(e) => setCore({ ...core, known_languages: e.target.value })}
                />

                <label>Experience level</label>
                <LevelPicker
                  value={core.experience_level}
                  onChange={(l) => setCore({ ...core, experience_level: l })}
                />

                <label>
                  Goals &amp; what you want to build
                  <span style={{ color: "var(--amber)", marginLeft: 4 }}>*</span>
                </label>
                <textarea
                  placeholder="e.g. I want to build and deploy full-stack AI apps with React + FastAPI, learn RAG, and ship a real product."
                  value={core.goals}
                  onChange={(e) => setCore({ ...core, goals: e.target.value })}
                  style={{ minHeight: 96 }}
                />

                <label>Your background</label>
                <input
                  placeholder="e.g. CS student / career switcher from marketing"
                  value={core.background}
                  onChange={(e) => setCore({ ...core, background: e.target.value })}
                />

                {/* Side-by-side age + hours */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 0 }}>
                  <div>
                    <label>
                      Age <span style={{ color: "var(--amber)" }}>*</span>
                    </label>
                    <input
                      type="number" min="10" max="100" placeholder="e.g. 22"
                      value={core.age}
                      onChange={(e) => setCore({ ...core, age: e.target.value })}
                    />
                  </div>
                  <div>
                    <label>Hours / week</label>
                    <input
                      type="number" min="1" max="80"
                      value={core.hours_per_week}
                      onChange={(e) => setCore({ ...core, hours_per_week: e.target.value })}
                    />
                  </div>
                </div>

                <button className="full" style={{ marginTop: 26 }} onClick={handleNext}>
                  Next
                  <ChevronRight size={14} style={{ display: "inline", verticalAlign: "middle", marginLeft: 6 }} />
                </button>
              </>
            )}

            {/* ═══════════ STEP 2 ═══════════ */}
            {step === 2 && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <h1 style={headingGrad("linear-gradient(135deg, var(--text) 30%, var(--cyan, #4dd0ff) 120%)")}>
                    Personalize further
                  </h1>
                  <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
                    All optional — richer signal means a better-calibrated program.
                    Skip anything you want.
                  </p>
                </div>

                <div style={{
                  padding: "10px 13px", borderRadius: "var(--radius-sm)", marginBottom: 18,
                  background: "rgba(77,208,255,0.05)", border: "1px solid rgba(77,208,255,0.15)",
                  fontSize: 12, color: "var(--cyan, #4dd0ff)",
                }}>
                  Hit "Skip &amp; generate" below to go straight to your program — no data needed here.
                </div>

                {/* GitHub */}
                <label style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <GitBranch size={11} style={{ opacity: 0.65 }} />
                  GitHub username <OptBadge />
                </label>
                <input
                  placeholder="e.g. SpookySparrow"
                  value={optional.github_username}
                  onChange={(e) => setOpt("github_username", e.target.value)}
                />
                <p style={{ fontSize: 11, color: "var(--faint)", marginTop: -4, marginBottom: 10 }}>
                  Public repos only — no OAuth, no private access.
                </p>

                {/* CV upload */}
                <label style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <Upload size={11} style={{ opacity: 0.65 }} />
                  CV / Résumé <OptBadge />
                </label>
                <input
                  ref={fileRef} type="file" accept=".pdf,.txt,.md"
                  style={{ display: "none" }}
                  onChange={handleCvChange}
                />
                {cvFile ? (
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 12px", borderRadius: "var(--radius-sm)", marginBottom: 14,
                    background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.22)",
                  }}>
                    <span style={{
                      fontSize: 13, color: "var(--green)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      ✓ {cvFile.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => { setCvFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "var(--muted)", padding: 4, flexShrink: 0, transform: "none",
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    style={{
                      width: "100%", padding: "11px 14px", marginBottom: 14,
                      background: "rgba(255,255,255,0.02)",
                      border: "1px dashed rgba(255,255,255,0.1)",
                      borderRadius: "var(--radius-sm)", color: "var(--muted)",
                      cursor: "pointer", fontSize: 13, textAlign: "left", transform: "none",
                    }}
                  >
                    Upload PDF, TXT, or MD — max 5 MB
                  </button>
                )}

                {/* Text fields */}
                <label>Preferred learning style <OptBadge /></label>
                <input
                  placeholder="e.g. hands-on projects, guided steps, read-then-build"
                  value={optional.preferred_learning_style}
                  onChange={(e) => setOpt("preferred_learning_style", e.target.value)}
                />

                <label>What do you most want to build? <OptBadge /></label>
                <textarea
                  placeholder="e.g. A chatbot product using NLP"
                  value={optional.focus_area}
                  onChange={(e) => setOpt("focus_area", e.target.value)}
                  style={{ minHeight: 64 }}
                />

                <label>What does success look like? <OptBadge /></label>
                <input
                  placeholder="e.g. Land a junior ML engineer role in 3 months."
                  value={optional.target_outcome}
                  onChange={(e) => setOpt("target_outcome", e.target.value)}
                />

                <label>Anything else about your background? <OptBadge /></label>
                <textarea
                  placeholder="e.g. Took Andrew Ng's ML course, built toy models, never shipped to production."
                  value={optional.prior_experience_notes}
                  onChange={(e) => setOpt("prior_experience_notes", e.target.value)}
                  style={{ minHeight: 64 }}
                />

                {/* CTAs */}
                <div style={{ display: "flex", gap: 10, marginTop: 26 }}>
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
                    {busy ? (
                      <><span className="spinner" />&nbsp; Generating program…</>
                    ) : (
                      <>
                        <Zap size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
                        Generate my program
                      </>
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => goStep(1)}
                  style={{
                    background: "none", border: "none", color: "var(--faint)",
                    cursor: "pointer", fontSize: 12, marginTop: 14, padding: 0,
                    transform: "none", width: "auto", display: "block",
                  }}
                >
                  ← Back to core profile
                </button>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
