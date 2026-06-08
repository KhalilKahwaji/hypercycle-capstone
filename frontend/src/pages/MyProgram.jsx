import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import client from "../api/client";

function RegenModal({ onConfirm, onCancel, busy }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)",
      zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
    }}>
      <div className="card fade-in" style={{ maxWidth: 420, margin: 0, width: "100%" }}>
        <h3 style={{ marginBottom: 12, color: "var(--red)" }}>Regenerate program?</h3>
        <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>
          This permanently deletes:
        </p>
        <ul style={{ listStyle: "disc", paddingLeft: 20, fontSize: 13, lineHeight: 1.9, color: "var(--text)" }}>
          <li>Your current program and all days</li>
          <li>All submission history</li>
          <li>All AI feedback</li>
          <li>All progress and completed-day records</li>
        </ul>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 12 }}>
          A new program will be generated from your saved assessment. This cannot be undone.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button
            className="ghost"
            onClick={onCancel}
            disabled={busy}
            style={{ flex: 1 }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            style={{ flex: 1, background: "var(--red)", color: "#fff" }}
          >
            {busy
              ? <><span className="spinner" /> &nbsp;Generating…</>
              : "Delete all & regenerate"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MyProgram() {
  const navigate = useNavigate();
  const [program, setProgram] = useState(null);
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showRegen, setShowRegen] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([client.get("/programs/me"), client.get("/programs/me/days")])
      .then(([p, d]) => {
        setProgram(p.data.program);
        setDays(d.data.days);
      })
      .catch((e) => setError(e.message || "Failed to load program."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRegen = async () => {
    setRegenBusy(true);
    try {
      await client.post("/programs/generate");
      setShowRegen(false);
      load();
    } catch (e) {
      setError(e.message || "Regeneration failed.");
      setShowRegen(false);
    } finally {
      setRegenBusy(false);
    }
  };

  if (loading)
    return (
      <div style={{ padding: "60px 0", color: "var(--muted)", display: "flex", alignItems: "center", gap: 10 }}>
        <span className="spinner" /> loading program…
      </div>
    );

  if (error)
    return (
      <div>
        <h1 className="page-title">My Program</h1>
        <div className="alert err">
          {error}{" "}
          <button className="ghost" style={{ marginLeft: 12 }} onClick={load}>Retry</button>
        </div>
      </div>
    );

  if (!program)
    return (
      <div>
        <h1 className="page-title">My Program</h1>
        <div className="alert info">
          No program yet. <Link to="/assessment">Take the self-assessment</Link> to generate your
          personalized 16-day program.
        </div>
      </div>
    );

  return (
    <div>
      {/* Header row with title + regenerate button */}
      <div style={{
        display: "flex", alignItems: "flex-start",
        justifyContent: "space-between", gap: 16, flexWrap: "wrap",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="page-title fade-in">{program.title}</h1>
          <p className="page-sub fade-in-1">{program.summary}</p>
        </div>
        <button
          className="ghost fade-in"
          onClick={() => setShowRegen(true)}
          style={{ flexShrink: 0, marginTop: 6 }}
        >
          Regenerate program
        </button>
      </div>

      {/* Day list with staggered entrance */}
      {days.map((d, i) => {
        const state = d.is_completed ? "completed" : d.is_unlocked ? "unlocked" : "locked";
        return (
          <div
            key={d.id}
            className={`day-card ${state} fade-in`}
            style={{ animationDelay: `${Math.min(i * 0.04, 0.4)}s` }}
            onClick={() => d.is_unlocked && navigate(`/program/day/${d.id}`)}
          >
            <div className="day-num">{String(d.day_number).padStart(2, "0")}</div>
            <div className="day-body">
              <div className="t">{d.title}</div>
              <div className="o">{d.objective}</div>
            </div>
            {d.is_completed ? (
              <span className="badge green">Completed</span>
            ) : d.is_unlocked ? (
              <span className="badge amber">Unlocked</span>
            ) : (
              <span className="badge locked">Locked</span>
            )}
          </div>
        );
      })}

      {showRegen && (
        <RegenModal
          onConfirm={handleRegen}
          onCancel={() => setShowRegen(false)}
          busy={regenBusy}
        />
      )}
    </div>
  );
}
