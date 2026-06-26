import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import client from "../api/client";

export default function MyProgram() {
  const navigate = useNavigate();
  const [program, setProgram] = useState(null);
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      {/* Header row with title + manage-programs button */}
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
          onClick={() => navigate("/programs")}
          style={{ flexShrink: 0, marginTop: 6 }}
        >
          Manage programs
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
    </div>
  );
}
