import { useEffect, useRef, useState } from "react";
import { GitBranch, Upload, X, ChevronDown, ChevronUp, Save } from "lucide-react";
import client from "../api/client";
import BadgeIcon from "../components/BadgeIcon";
import BadgeToast from "../components/BadgeToast";

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

function pickMessage(n) {
  return PRESS_MESSAGES.find(([t]) => n >= t)?.[1] ?? `That's ${n}. Keep going, I guess.`;
}
function pickIcon(n) {
  if (n >= 50) return { icon: "Target",  color: "#f87171" };
  if (n >= 20) return { icon: "Zap",     color: "#4ade80" };
  if (n >= 10) return { icon: "Star",    color: "#8b7cff" };
  return               { icon: "Send",   color: "#4dd0ff" };
}
function pickButtonLabel(n) {
  if (n >= 150) return "It was a test button";
  if (n >= 50)  return "WHY ARE YOU STILL DOING THIS";
  if (n >= 20)  return "Stop. Please.";
  if (n >= 10)  return "okay but why";
  if (n >= 5)   return "Again?";
  if (n >= 1)   return "Press me again";
  return "Press me";
}

function StatPill({ label, value }) {
  return (
    <div style={{
      background: "rgba(13,15,24,0.72)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "var(--radius)",
      padding: "16px 22px",
      textAlign: "center",
      minWidth: 130,
      boxShadow: "var(--shadow-md)",
    }}>
      <div style={{
        fontSize: 26,
        fontWeight: 900,
        fontFamily: "var(--display)",
        background: "linear-gradient(135deg, var(--amber), var(--cyan))",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        lineHeight: 1.1,
      }}>{value}</div>
      <div style={{
        fontSize: 10,
        color: "var(--faint)",
        textTransform: "uppercase",
        letterSpacing: "1.8px",
        marginTop: 4,
      }}>{label}</div>
    </div>
  );
}

function BadgeCard({ badge }) {
  const earned = badge.earned;
  const iconColor = earned ? badge.color : "var(--faint)";
  const earnedDate = badge.earned_at
    ? new Date(badge.earned_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <div style={{
      background: earned
        ? `rgba(13,15,24,0.8)`
        : "rgba(13,15,24,0.5)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      border: `1px solid ${earned ? badge.color + "44" : "rgba(255,255,255,0.07)"}`,
      borderRadius: "var(--radius)",
      padding: "20px",
      opacity: earned ? 1 : 0.45,
      display: "flex",
      flexDirection: "column",
      gap: 12,
      transition: "opacity 0.2s, transform 0.2s var(--ease), box-shadow 0.2s",
      boxShadow: earned
        ? `0 4px 24px rgba(0,0,0,0.4), 0 0 20px ${badge.color}22`
        : "var(--shadow-sm)",
      cursor: earned ? "default" : "default",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <BadgeIcon name={badge.icon} size={28} color={iconColor} />
        <div>
          <div style={{ fontWeight: 700, color: earned ? badge.color : "var(--muted)", fontSize: 14 }}>
            {badge.name}
          </div>
          {earnedDate && (
            <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>{earnedDate}</div>
          )}
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", lineHeight: 1.55 }}>
        {badge.description}
      </p>
      {!earned && (
        <div style={{ fontSize: 10, color: "var(--faint)", letterSpacing: "1.5px", textTransform: "uppercase" }}>
          Locked
        </div>
      )}
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

function OnboardingCard() {
  const fileRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState({
    github_username: "",
    preferred_learning_style: "",
    focus_area: "",
    target_outcome: "",
    prior_experience_notes: "",
  });
  const [cvFile, setCvFile] = useState(null);
  const [currentCvUrl, setCurrentCvUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    client.get("/onboarding/me").then((r) => {
      const a = r.data.assessment;
      if (!a) return;
      setFields({
        github_username: a.github_username || "",
        preferred_learning_style: a.preferred_learning_style || "",
        focus_area: a.focus_area || "",
        target_outcome: a.target_outcome || "",
        prior_experience_notes: a.prior_experience_notes || "",
      });
      setCurrentCvUrl(a.cv_file_url || null);
    }).catch(() => {});
  }, []);

  const setF = (k, v) => setFields((f) => ({ ...f, [k]: v }));

  const handleCvChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.split(".").pop().toLowerCase();
    if (!["pdf", "txt", "md"].includes(ext)) { setErr("CV must be PDF, TXT, or MD."); return; }
    if (f.size > 5 * 1024 * 1024) { setErr("CV file must be under 5 MB."); return; }
    setErr(""); setCvFile(f);
  };

  const save = async () => {
    setMsg(""); setErr(""); setBusy(true);
    try {
      const fd = new FormData();
      if (cvFile) fd.append("cv_file", cvFile);
      Object.entries(fields).forEach(([k, v]) => { if (v.trim()) fd.append(k, v.trim()); });
      const r = await client.post("/onboarding", fd);
      setMsg("Saved. This will apply the next time you regenerate your program.");
      setCvFile(null);
      if (r.data.assessment?.cv_file_url) setCurrentCvUrl(r.data.assessment.cv_file_url);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fade-in" style={{ marginBottom: 32 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", borderRadius: "var(--radius)",
          background: "rgba(13,15,24,0.72)", backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer",
          color: "var(--text)", textAlign: "left",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Profile &amp; CV</span>
          <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 10 }}>
            GitHub, CV, learning preferences
          </span>
        </div>
        {open ? <ChevronUp size={16} style={{ opacity: 0.5 }} /> : <ChevronDown size={16} style={{ opacity: 0.5 }} />}
      </button>

      {open && (
        <div className="card" style={{ marginTop: 4, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
          {err && <div className="alert err" style={{ marginBottom: 14 }}>{err}</div>}
          {msg && <div className="alert ok" style={{ marginBottom: 14 }}>{msg}</div>}

          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <GitBranch size={14} style={{ opacity: 0.7 }} /> GitHub username <OptionalBadge />
          </label>
          <input
            placeholder="e.g. khalilkahwaji"
            value={fields.github_username}
            onChange={(e) => setF("github_username", e.target.value)}
          />
          <p className="muted" style={{ fontSize: 12, marginTop: -8, marginBottom: 14 }}>
            Public profile only — no OAuth, no private data.
          </p>

          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Upload size={14} style={{ opacity: 0.7 }} /> CV / Résumé <OptionalBadge />
          </label>
          <input ref={fileRef} type="file" accept=".pdf,.txt,.md" style={{ display: "none" }} onChange={handleCvChange} />
          {cvFile ? (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 14px", borderRadius: "var(--radius-sm)",
              background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", marginBottom: 14,
            }}>
              <span style={{ fontSize: 13, color: "var(--text)", wordBreak: "break-all" }}>{cvFile.name}</span>
              <button type="button"
                onClick={() => { setCvFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4 }}>
                <X size={14} />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()}
              style={{
                width: "100%", padding: "11px 14px", marginBottom: 4,
                background: "rgba(255,255,255,0.03)", border: "1px dashed var(--border)",
                borderRadius: "var(--radius-sm)", color: "var(--muted)", cursor: "pointer",
                fontSize: 13, textAlign: "left",
              }}
            >
              {currentCvUrl ? "Replace current CV (PDF, TXT, or MD)" : "Upload CV (PDF, TXT, or MD) — max 5 MB"}
            </button>
          )}
          {currentCvUrl && !cvFile && (
            <p className="muted" style={{ fontSize: 11, marginBottom: 14 }}>
              CV on file.{" "}
              <a href={currentCvUrl} target="_blank" rel="noreferrer" style={{ color: "var(--cyan, #4dd0ff)" }}>View</a>
            </p>
          )}

          <label>Preferred learning style <OptionalBadge /></label>
          <input
            placeholder="e.g. hands-on projects, reading then building, guided steps"
            value={fields.preferred_learning_style}
            onChange={(e) => setF("preferred_learning_style", e.target.value)}
          />

          <label>What you most want to build / focus on <OptionalBadge /></label>
          <textarea
            placeholder="e.g. I'm mainly interested in NLP and want to build a chatbot product."
            value={fields.focus_area}
            onChange={(e) => setF("focus_area", e.target.value)}
            style={{ minHeight: 64 }}
          />

          <label>What success looks like for you <OptionalBadge /></label>
          <input
            placeholder="e.g. Land a junior ML engineer role in 3 months."
            value={fields.target_outcome}
            onChange={(e) => setF("target_outcome", e.target.value)}
          />

          <label>Additional background notes <OptionalBadge /></label>
          <textarea
            placeholder="e.g. I took Andrew Ng's ML course but never shipped to production."
            value={fields.prior_experience_notes}
            onChange={(e) => setF("prior_experience_notes", e.target.value)}
            style={{ minHeight: 64 }}
          />

          <button onClick={save} disabled={busy} style={{ marginTop: 10 }}>
            {busy
              ? <><span className="spinner" />&nbsp; Saving…</>
              : <><Save size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />Save profile</>
            }
          </button>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Changes apply the next time you regenerate your program from the Assessment page.
          </p>
        </div>
      )}
    </div>
  );
}

export default function Profile() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [pressCount, setPressCount] = useState(0);
  const [demoToast, setDemoToast] = useState([]);
  const timerRef = useRef(null);

  useEffect(() => {
    client.get("/achievements/me")
      .then((r) => setData(r.data))
      .catch((e) => setError(e.message));
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleDemoPress = () => {
    const n = pressCount + 1;
    setPressCount(n);
    if (timerRef.current) clearTimeout(timerRef.current);
    const { icon, color } = pickIcon(n);
    setDemoToast([{
      key: "demo_press",
      name: n === 1 ? "Button Found" : `Button Masher (×${n})`,
      description: pickMessage(n),
      icon,
      color,
    }]);
    timerRef.current = setTimeout(() => setDemoToast([]), 4000);
  };

  if (error) return <div className="alert err">{error}</div>;
  if (!data) return (
    <div style={{ padding: "60px 0", color: "var(--muted)", display: "flex", alignItems: "center", gap: 12 }}>
      <span className="spinner" /> Loading achievements…
    </div>
  );

  const { badges, stats } = data;

  return (
    <div>
      <h1 className="page-title fade-in">Profile &amp; Achievements</h1>
      <p className="page-sub fade-in-1">{stats.earned}/{stats.total} badges earned</p>

      <OnboardingCard />

      {/* Stats hero row */}
      <div className="fade-in-1" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 36 }}>
        <StatPill label="Badges earned" value={`${stats.earned}/${stats.total}`} />
        <StatPill label="Days completed" value={stats.completed_days} />
        <StatPill label="Total submissions" value={stats.total_submissions} />
      </div>

      {/* Demo / debug card */}
      <div className="fade-in-2" style={{
        border: "1px dashed rgba(139,124,255,0.35)",
        borderRadius: "var(--radius)",
        padding: "18px 22px",
        marginBottom: 32,
        background: "rgba(139,124,255,0.05)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontWeight: 700, color: "var(--amber)", fontSize: 13, marginBottom: 4 }}>
            Definitely Not a Test Button
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {pressCount === 0
              ? "Try pressing this button. Go on."
              : `Wow, you've pressed it ${pressCount} time${pressCount === 1 ? "" : "s"}.`}
          </div>
        </div>
        <button onClick={handleDemoPress} style={{ flexShrink: 0 }}>
          {pickButtonLabel(pressCount)}
        </button>
      </div>

      {/* Badge grid */}
      <div className="fade-in-3" style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        gap: 14,
      }}>
        {badges.map((badge) => (
          <BadgeCard key={badge.key} badge={badge} />
        ))}
      </div>

      <BadgeToast badges={demoToast} onDismiss={() => setDemoToast([])} />
    </div>
  );
}
