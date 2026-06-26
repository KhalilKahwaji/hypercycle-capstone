import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  GitBranch, Upload, X, Save, ChevronDown, ChevronUp,
  ExternalLink, FileText, Pencil,
} from "lucide-react";
import client from "../api/client";
import BadgeIcon from "../components/BadgeIcon";
import BadgeToast from "../components/BadgeToast";
import ProgressRing from "../components/ProgressRing";

// ─── Constants ────────────────────────────────────────────────────────────────
const BADGE_CATEGORIES = [
  { label: "Getting Started", keys: ["program_generated", "setup_complete"] },
  { label: "Submissions",     keys: ["first_submission", "first_pass", "comeback_kid", "consistent"] },
  { label: "Performance",     keys: ["perfect_score", "high_achiever"] },
  { label: "Milestones",      keys: ["day_5_done", "halfway", "day_10_done", "graduation"] },
  { label: "CLI Mastery",     keys: ["cli_debut", "cli_veteran", "question_asker"] },
];

const AVATAR_PALETTES = [
  ["#8b7cff", "#4dd0ff"],
  ["#4dd0ff", "#4ade80"],
  ["#6d5efc", "#f87171"],
  ["#e8b84b", "#8b7cff"],
  ["#4ade80", "#4dd0ff"],
  ["#f87171", "#e8b84b"],
  ["#4dd0ff", "#8b7cff"],
];

const PRESS_MESSAGES = [
  [150, "Now stop procrastinating and go learn something -.-"],
  [145, "OK OK I'LL ADMIT, THIS IS A TEST BUTTON."],
  [100, "At this point you're just trolling."],
  [50,  "Seek professional assistance."],
  [20,  "Please. Stop."],
  [10,  "OK this is getting weird."],
  [5,   "Still going, huh?"],
  [2,   "Wow, you actually pressed it again."],
  [1,   "Oh. You actually pressed it."],
];

const LEVEL_COLOR = {
  beginner:     "#4dd0ff",
  intermediate: "#e8b84b",
  advanced:     "#4ade80",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function strHash(s = "") {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
const avatarPalette = (s) => AVATAR_PALETTES[strHash(s) % AVATAR_PALETTES.length];
const getInitials = (name = "") =>
  (name || "?").trim().split(/\s+/).map((w) => w[0] || "").join("").toUpperCase().slice(0, 2) || "?";
const fmtDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : "—";

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function useCountUp(target, scale = 1) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const intTarget = typeof target === "number" ? Math.round(target * scale) : 0;
    if (intTarget === 0) { setVal(0); return; }
    let frame = 0;
    const FRAMES = 50;
    const id = setInterval(() => {
      frame++;
      setVal(Math.round(easeOutCubic(Math.min(frame / FRAMES, 1)) * intTarget));
      if (frame >= FRAMES) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps
  return val;
}

const pickMessage  = (n) => PRESS_MESSAGES.find(([t]) => n >= t)?.[1] ?? `That's ${n}. Keep going.`;
const pickIcon     = (n) => n >= 50
  ? { icon: "Target", color: "#f87171" }
  : n >= 20
    ? { icon: "Zap",  color: "#4ade80" }
    : n >= 10
      ? { icon: "Star", color: "#8b7cff" }
      : { icon: "Send", color: "#4dd0ff" };
const pickBtnLabel = (n) =>
  n >= 150 ? "It was a test button"
  : n >= 50  ? "WHY ARE YOU STILL DOING THIS"
  : n >= 20  ? "Stop. Please."
  : n >= 10  ? "okay but why"
  : n >= 5   ? "Again?"
  : n >= 1   ? "Press me again"
  : "Press me";

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name = "", username = "", size = 80 }) {
  const [c1, c2] = avatarPalette(username);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--display)", fontWeight: 900,
      fontSize: Math.round(size * 0.34),
      color: "rgba(255,255,255,0.95)",
      letterSpacing: -0.5,
      boxShadow: `0 0 0 2px rgba(255,255,255,0.1), 0 0 48px ${c1}55, 0 0 0 8px ${c1}0a`,
    }}>
      {getInitials(name)}
    </div>
  );
}

// ─── Chip ─────────────────────────────────────────────────────────────────────
function Chip({ children, color = "var(--amber)" }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, letterSpacing: "0.6px",
      padding: "3px 10px", borderRadius: 99,
      background: `${color}1a`, color,
      border: `1px solid ${color}38`,
      textTransform: "capitalize", flexShrink: 0, whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

// ─── Metric tile ─────────────────────────────────────────────────────────────
function MetricTile({ label, value, suffix = "", scale = 1, accent, animDelay = 0 }) {
  const raw = useCountUp(value, scale);
  const display = value == null
    ? "—"
    : scale !== 1
      ? `${(raw / scale).toFixed(1)}${suffix}`
      : `${raw}${suffix}`;
  const grad = accent
    ? `linear-gradient(135deg, ${accent} 0%, var(--cyan) 100%)`
    : "linear-gradient(135deg, var(--amber) 0%, var(--cyan) 100%)";
  return (
    <div className="metric fade-in" style={{ animationDelay: `${animDelay}ms` }}>
      <div className="label">{label}</div>
      <div className="value" style={{
        fontSize: 38,
        background: grad,
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
      }}>
        {display}
      </div>
    </div>
  );
}

// ─── Info row ─────────────────────────────────────────────────────────────────
function InfoRow({ label, children }) {
  return (
    <div style={{ padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <div style={{
        fontSize: 10, color: "var(--faint)",
        textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 3,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

// ─── Badge card ───────────────────────────────────────────────────────────────
function BadgeCard({ badge }) {
  const [hov, setHov] = useState(false);
  const earned = badge.earned;
  const earnedDate = badge.earned_at
    ? new Date(badge.earned_at).toLocaleDateString(undefined, {
        month: "short", day: "numeric", year: "numeric",
      })
    : null;

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: earned ? "rgba(13,15,24,0.85)" : "rgba(13,15,24,0.36)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: `1px solid ${earned
          ? hov ? `${badge.color}90` : `${badge.color}44`
          : "rgba(255,255,255,0.05)"}`,
        borderRadius: "var(--radius)",
        padding: "16px 18px",
        opacity: earned ? 1 : 0.42,
        display: "flex", flexDirection: "column", gap: 10,
        transition: "all 0.22s var(--ease)",
        boxShadow: earned && hov
          ? `0 10px 36px rgba(0,0,0,0.55), 0 0 30px ${badge.color}2e`
          : earned
            ? `0 4px 18px rgba(0,0,0,0.35), 0 0 18px ${badge.color}14`
            : "var(--shadow-sm)",
        transform: earned && hov ? "translateY(-3px) scale(1.02)" : "none",
        cursor: "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <div style={{
          width: 38, height: 38, borderRadius: "var(--radius-sm)", flexShrink: 0,
          background: earned ? `${badge.color}1c` : "rgba(255,255,255,0.04)",
          border: `1px solid ${earned ? `${badge.color}34` : "rgba(255,255,255,0.06)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "box-shadow 0.22s",
          boxShadow: earned && hov ? `0 0 18px ${badge.color}44` : "none",
        }}>
          <BadgeIcon name={badge.icon} size={18} color={earned ? badge.color : "var(--faint)"} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: earned ? badge.color : "var(--faint)", lineHeight: 1.3 }}>
            {badge.name}
          </div>
          <div style={{
            fontSize: 10, marginTop: 2, color: "var(--faint)",
            letterSpacing: earned ? "0.4px" : "1.2px",
            textTransform: earned ? "none" : "uppercase",
          }}>
            {earned ? (earnedDate || "Earned") : "Locked"}
          </div>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: earned ? "var(--muted)" : "var(--faint)", lineHeight: 1.55 }}>
        {badge.description}
      </p>
    </div>
  );
}

// ─── Category group ───────────────────────────────────────────────────────────
function CategoryGroup({ label, badges }) {
  const earnedCount = badges.filter((b) => b.earned).length;
  const allDone = earnedCount === badges.length;
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{
          fontFamily: "var(--display)", fontWeight: 700, fontSize: 16,
          color: "var(--text)", letterSpacing: "-0.2px",
        }}>
          {label}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "1px",
          padding: "2px 9px", borderRadius: 99,
          background: allDone ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.04)",
          color: allDone ? "var(--green)" : "var(--faint)",
          border: `1px solid ${allDone ? "rgba(74,222,128,0.22)" : "rgba(255,255,255,0.07)"}`,
        }}>
          {earnedCount}/{badges.length}
        </span>
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(226px, 1fr))", gap: 12 }}>
        {badges.map((b) => <BadgeCard key={b.key} badge={b} />)}
      </div>
    </div>
  );
}

// ─── Edit card ────────────────────────────────────────────────────────────────
function EditCard() {
  const fileRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState({
    github_username: "", preferred_learning_style: "",
    focus_area: "", target_outcome: "", prior_experience_notes: "",
  });
  const [cvFile, setCvFile] = useState(null);
  const [cvUrl, setCvUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    client.get("/onboarding/me").then((r) => {
      const a = r.data.assessment;
      if (!a) return;
      setFields({
        github_username:          a.github_username          || "",
        preferred_learning_style: a.preferred_learning_style || "",
        focus_area:               a.focus_area               || "",
        target_outcome:           a.target_outcome           || "",
        prior_experience_notes:   a.prior_experience_notes   || "",
      });
      setCvUrl(a.cv_file_url || null);
    }).catch(() => {});
  }, []);

  const setF = (k, v) => setFields((f) => ({ ...f, [k]: v }));

  const handleCv = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.split(".").pop().toLowerCase();
    if (!["pdf", "txt", "md"].includes(ext)) { setErr("CV must be PDF, TXT, or MD."); return; }
    if (f.size > 5 * 1024 * 1024) { setErr("CV must be under 5 MB."); return; }
    setErr(""); setCvFile(f);
  };

  const save = async () => {
    setMsg(""); setErr(""); setBusy(true);
    try {
      const fd = new FormData();
      if (cvFile) fd.append("cv_file", cvFile);
      Object.entries(fields).forEach(([k, v]) => { if (v.trim()) fd.append(k, v.trim()); });
      const r = await client.post("/onboarding", fd);
      setMsg("Saved — applies on next program regeneration.");
      setCvFile(null);
      if (r.data.assessment?.cv_file_url) setCvUrl(r.data.assessment.cv_file_url);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginBottom: 28 }}>
      <button
        type="button" className="ghost"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "12px 18px",
          borderRadius: open ? "var(--radius) var(--radius) 0 0" : "var(--radius)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Pencil size={13} style={{ opacity: 0.6 }} />
          <span style={{ fontWeight: 700, fontSize: 13 }}>Edit enrichment data</span>
          <span style={{ fontSize: 12, color: "var(--faint)" }}>GitHub · CV · learning preferences</span>
        </div>
        {open
          ? <ChevronUp size={14} style={{ opacity: 0.45, flexShrink: 0 }} />
          : <ChevronDown size={14} style={{ opacity: 0.45, flexShrink: 0 }} />}
      </button>

      {open && (
        <div className="card" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, marginBottom: 0, marginTop: 0 }}>
          {err && <div className="alert err" style={{ marginBottom: 14 }}>{err}</div>}
          {msg && <div className="alert ok" style={{ marginBottom: 14 }}>{msg}</div>}

          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <GitBranch size={12} style={{ opacity: 0.6 }} /> GitHub Username
          </label>
          <input
            placeholder="e.g. SpookySparrow"
            value={fields.github_username}
            onChange={(e) => setF("github_username", e.target.value)}
          />

          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Upload size={12} style={{ opacity: 0.6 }} /> CV / Résumé
          </label>
          <input ref={fileRef} type="file" accept=".pdf,.txt,.md" style={{ display: "none" }} onChange={handleCv} />
          {cvFile ? (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 14px", borderRadius: "var(--radius-sm)",
              background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", marginBottom: 14,
            }}>
              <span style={{ fontSize: 13, wordBreak: "break-all" }}>{cvFile.name}</span>
              <button
                type="button"
                onClick={() => { setCvFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4, lineHeight: 1 }}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              style={{
                width: "100%", padding: "10px 14px", marginBottom: 4,
                background: "rgba(255,255,255,0.03)", border: "1px dashed var(--border)",
                borderRadius: "var(--radius-sm)", color: "var(--muted)",
                cursor: "pointer", fontSize: 13, textAlign: "left",
              }}
            >
              {cvUrl ? "Replace current CV (PDF, TXT, or MD)" : "Upload CV (PDF, TXT, or MD — max 5 MB)"}
            </button>
          )}
          {cvUrl && !cvFile && (
            <p className="muted" style={{ fontSize: 11, marginBottom: 14 }}>
              CV on file.{" "}
              <a href={cvUrl} target="_blank" rel="noreferrer" style={{ color: "var(--cyan)" }}>View</a>
            </p>
          )}

          <label>Preferred learning style</label>
          <input
            placeholder="e.g. hands-on projects, guided steps, reading first"
            value={fields.preferred_learning_style}
            onChange={(e) => setF("preferred_learning_style", e.target.value)}
          />

          <label>What you most want to build / focus on</label>
          <textarea
            style={{ minHeight: 64 }}
            placeholder="e.g. NLP, chatbots, AI-powered apps"
            value={fields.focus_area}
            onChange={(e) => setF("focus_area", e.target.value)}
          />

          <label>What success looks like</label>
          <input
            placeholder="e.g. Land a junior ML role in 3 months"
            value={fields.target_outcome}
            onChange={(e) => setF("target_outcome", e.target.value)}
          />

          <label>Additional background notes</label>
          <textarea
            style={{ minHeight: 64 }}
            placeholder="e.g. Completed Ng's ML course, never shipped to production"
            value={fields.prior_experience_notes}
            onChange={(e) => setF("prior_experience_notes", e.target.value)}
          />

          <button onClick={save} disabled={busy} style={{ marginTop: 10 }}>
            {busy
              ? <><span className="spinner" />&nbsp; Saving…</>
              : <><Save size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />Save changes</>}
          </button>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Changes apply the next time you regenerate your program.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Profile() {
  const { user } = useAuth();
  const [achData, setAchData]     = useState(null);
  const [progress, setProgress]   = useState(null);
  const [program, setProgram]     = useState(null);
  const [assessment, setAssess]   = useState(null);
  const [onboarding, setOnboard]  = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [pressCount, setPress]    = useState(0);
  const [demoToast, setDemoToast] = useState([]);
  const timerRef = useRef(null);

  useEffect(() => {
    Promise.all([
      client.get("/achievements/me").catch(() => ({ data: { badges: [], stats: {} } })),
      client.get("/progress/me").catch(() => ({ data: {} })),
      client.get("/programs/me").catch(() => ({ data: { program: null } })),
      client.get("/assessments/me").catch(() => ({ data: { assessment: null } })),
      client.get("/onboarding/me").catch(() => ({ data: { assessment: null } })),
    ]).then(([ach, prog, prg, assess, onb]) => {
      setAchData(ach.data);
      setProgress(prog.data);
      setProgram(prg.data.program);
      setAssess(assess.data.assessment);
      setOnboard(onb.data.assessment);
      setLoading(false);
    }).catch((e) => { setError(e.message); setLoading(false); });
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleDemoPress = () => {
    const n = pressCount + 1;
    setPress(n);
    if (timerRef.current) clearTimeout(timerRef.current);
    const { icon, color } = pickIcon(n);
    setDemoToast([{
      key: "demo",
      name: n === 1 ? "Button Found" : `Button Masher (×${n})`,
      description: pickMessage(n),
      icon, color,
    }]);
    timerRef.current = setTimeout(() => setDemoToast([]), 4000);
  };

  if (loading) return (
    <div style={{ padding: "80px 0", display: "flex", alignItems: "center", gap: 12, color: "var(--muted)" }}>
      <span className="spinner" /> Loading profile…
    </div>
  );
  if (error) return <div className="alert err">{error}</div>;

  const { badges = [], stats = {} } = achData || {};
  const badgeByKey = Object.fromEntries(badges.map((b) => [b.key, b]));
  const pct        = progress?.percentage ?? 0;
  const hasProg    = !!progress?.has_program;

  const categorized = BADGE_CATEGORIES.map((cat) => ({
    ...cat,
    badges: cat.keys.map((k) => badgeByKey[k]).filter(Boolean),
  }));

  const hasOnbData = onboarding && (
    onboarding.github_username || onboarding.cv_file_url ||
    onboarding.preferred_learning_style || onboarding.focus_area || onboarding.target_outcome
  );

  return (
    <div>
      {/* ─── Hero ──────────────────────────────────────────────────────── */}
      <div className="fade-in" style={{
        background: "rgba(13,15,24,0.76)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "32px 36px",
        marginBottom: 24,
        boxShadow: "var(--shadow-lg), 0 0 80px rgba(139,124,255,0.05)",
        display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap",
      }}>
        <Avatar name={user?.full_name} username={user?.username} size={80} />

        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{
            fontFamily: "var(--display)", fontWeight: 900,
            fontSize: "clamp(26px, 3.8vw, 40px)",
            letterSpacing: "-1.2px", lineHeight: 1.05, marginBottom: 8,
            background: "linear-gradient(135deg, var(--text) 35%, var(--amber) 115%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>
            {user?.full_name || "Learner"}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>@{user?.username}</span>
            <span style={{ fontSize: 12, color: "var(--faint)" }}>·</span>
            <span style={{ fontSize: 12, color: "var(--faint)" }}>Member since {fmtDate(user?.created_at)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {assessment?.experience_level && (
              <Chip color={LEVEL_COLOR[assessment.experience_level] || "var(--amber)"}>
                {assessment.experience_level}
              </Chip>
            )}
            <Chip color="var(--amber)">{stats.earned || 0}/{stats.total || 15} badges</Chip>
            {program && <Chip color="var(--cyan)">{program.title}</Chip>}
          </div>
        </div>

        {hasProg && (
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <div className="db-ring-wrap">
              <ProgressRing pct={pct} size={90} stroke={7} />
            </div>
            <div style={{
              fontSize: 10, color: "var(--faint)",
              textTransform: "uppercase", letterSpacing: "1.8px", marginTop: 8,
            }}>
              Complete
            </div>
          </div>
        )}
      </div>

      {/* ─── Stats row ─────────────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(166px, 1fr))",
        gap: 14, marginBottom: 44,
      }}>
        <MetricTile label="Days Completed"  value={stats.completed_days || 0}    animDelay={80}  />
        <MetricTile label="Current Streak"  value={stats.streak || 0}            animDelay={140} accent="#e8b84b" />
        <MetricTile label="Avg Score"       value={stats.avg_score ?? null}
          suffix="/10" scale={10}                                                 animDelay={200} accent="var(--cyan)" />
        <MetricTile label="Total Subs"      value={stats.total_submissions || 0} animDelay={260} />
      </div>

      {/* ─── Achievements ──────────────────────────────────────────────── */}
      <div className="fade-in-1">
        <h2 className="section-title" style={{ marginTop: 0, marginBottom: 24 }}>Achievements</h2>
        {categorized.map((cat) => (
          <CategoryGroup key={cat.label} label={cat.label} badges={cat.badges} />
        ))}
      </div>

      {/* ─── Profile info (2-col) ──────────────────────────────────────── */}
      {(assessment || hasOnbData) && (
        <div className="fade-in-2" style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16, marginBottom: 28,
        }}>
          {assessment && (
            <div className="card" style={{ margin: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: "var(--text)" }}>
                Learning Profile
              </div>
              {assessment.known_languages && (
                <InfoRow label="Known Languages">{assessment.known_languages}</InfoRow>
              )}
              {assessment.background && (
                <InfoRow label="Background">{assessment.background}</InfoRow>
              )}
              {assessment.goals && (
                <InfoRow label="Goals">{assessment.goals}</InfoRow>
              )}
              {assessment.hours_per_week && (
                <InfoRow label="Hours / Week">{assessment.hours_per_week}h</InfoRow>
              )}
            </div>
          )}

          {hasOnbData && (
            <div className="card" style={{ margin: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: "var(--text)" }}>
                Enrichment Data
              </div>
              {onboarding.github_username && (
                <InfoRow label="GitHub">
                  <a
                    href={`https://github.com/${onboarding.github_username}`}
                    target="_blank" rel="noreferrer"
                    style={{ color: "var(--cyan)", display: "inline-flex", alignItems: "center", gap: 4 }}
                  >
                    {onboarding.github_username}
                    <ExternalLink size={11} />
                  </a>
                </InfoRow>
              )}
              {onboarding.cv_file_url && (
                <InfoRow label="CV / Résumé">
                  <a
                    href={onboarding.cv_file_url} target="_blank" rel="noreferrer"
                    style={{ color: "var(--cyan)", display: "inline-flex", alignItems: "center", gap: 4 }}
                  >
                    <FileText size={12} />
                    View on file
                    <ExternalLink size={10} />
                  </a>
                </InfoRow>
              )}
              {onboarding.preferred_learning_style && (
                <InfoRow label="Learning Style">{onboarding.preferred_learning_style}</InfoRow>
              )}
              {onboarding.focus_area && (
                <InfoRow label="Focus Area">{onboarding.focus_area}</InfoRow>
              )}
              {onboarding.target_outcome && (
                <InfoRow label="Target Outcome">{onboarding.target_outcome}</InfoRow>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Edit section ──────────────────────────────────────────────── */}
      <div className="fade-in-3">
        <EditCard />
      </div>

      {/* ─── Easter egg ────────────────────────────────────────────────── */}
      <div style={{
        border: "1px dashed rgba(139,124,255,0.2)",
        borderRadius: "var(--radius)",
        padding: "14px 20px", marginBottom: 44,
        background: "rgba(139,124,255,0.02)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontWeight: 700, color: "var(--amber)", fontSize: 13, marginBottom: 3 }}>
            Definitely Not a Test Button
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {pressCount === 0
              ? "Try pressing this button. Go on."
              : `Wow, you've pressed it ${pressCount} time${pressCount === 1 ? "" : "s"}.`}
          </div>
        </div>
        <button onClick={handleDemoPress} style={{ flexShrink: 0 }}>
          {pickBtnLabel(pressCount)}
        </button>
      </div>

      <BadgeToast badges={demoToast} onDismiss={() => setDemoToast([])} />
    </div>
  );
}
