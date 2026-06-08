import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip,
} from "recharts";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";
import ProgressRing from "../components/ProgressRing";
import useCountUp from "../hooks/useCountUp";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [progress, setProgress] = useState(null);
  const [subs, setSubs] = useState([]);
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Hooks must be called unconditionally before any early return.
  const completedCount = useCountUp(progress?.completed_days ?? 0);
  const totalCount = useCountUp(progress?.total_days ?? 0);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([
      client.get("/progress/me"),
      client.get("/submissions/me"),
      client.get("/assessments/me"),
    ])
      .then(([p, s, a]) => {
        setProgress(p.data);
        setSubs(s.data.submissions);
        setAssessment(a.data.assessment ?? null);
      })
      .catch((e) => setError(e.message || "Failed to load dashboard."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const estimatedFinish = useMemo(() => {
    if (!progress?.has_program || !assessment?.hours_per_week) return null;
    const daysLeft = (progress.total_days ?? 16) - (progress.completed_days ?? 0);
    if (daysLeft <= 0) return "All done!";
    const weeksNeeded = (daysLeft * 5) / assessment.hours_per_week;
    const calDays = Math.ceil(weeksNeeded * 7);
    const d = new Date();
    d.setDate(d.getDate() + calDays);
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }, [progress, assessment]);

  if (loading)
    return (
      <div style={{ padding: "60px 0", color: "var(--muted)", display: "flex", alignItems: "center", gap: 10 }}>
        <span className="spinner" /> loading dashboard…
      </div>
    );

  if (error)
    return (
      <div>
        <h1 className="page-title">Welcome, {user?.full_name?.split(" ")[0]}.</h1>
        <div className="alert err">
          {error}{" "}
          <button className="ghost" style={{ marginLeft: 12 }} onClick={load}>Retry</button>
        </div>
      </div>
    );

  const byDay = {};
  subs.forEach((s) => {
    const score = s.feedback?.score ?? 0;
    if (!byDay[s.day_number] || score > byDay[s.day_number])
      byDay[s.day_number] = score;
  });
  const chartData = Array.from({ length: progress?.total_days || 15 }, (_, i) => ({
    day: `D${i + 1}`,
    score: byDay[i + 1] || 0,
  }));

  return (
    <div>
      <h1 className="page-title fade-in">Welcome, {user?.full_name?.split(" ")[0]}.</h1>
      <p className="page-sub fade-in-1">Here's where you stand.</p>

      {!progress?.has_program ? (
        <div className="alert info fade-in-1">
          You don't have a program yet.{" "}
          <Link to="/assessment">Take the self-assessment</Link> to generate one.
        </div>
      ) : (
        <>
          {/* Metrics row — 2 count-up cards + progress ring */}
          <div className="grid grid-3 fade-in-1" style={{ marginBottom: 16 }}>
            <div className="metric">
              <div className="label">Completed days</div>
              <div className="value">{completedCount}</div>
            </div>
            <div className="metric">
              <div className="label">Total days</div>
              <div className="value">{totalCount}</div>
            </div>
            <div className="metric" style={{
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              <div className="label" style={{ marginBottom: 4 }}>Progress</div>
              <ProgressRing pct={progress.percentage} size={90} stroke={8} />
            </div>
          </div>

          {/* Estimated finish date */}
          {estimatedFinish && (
            <p className="fade-in-2" style={{ fontSize: 13, color: "var(--muted)", marginBottom: 28 }}>
              Estimated finish:{" "}
              <span style={{ color: "var(--text)", fontWeight: 700 }}>{estimatedFinish}</span>
              <span style={{ color: "var(--faint)", fontSize: 11, marginLeft: 8 }}>
                (based on {assessment.hours_per_week}h/week)
              </span>
            </p>
          )}

          <h2 className="section-title fade-in-2">Score by day</h2>
          <div className="card fade-in-3" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="day" stroke="#5d6152" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 10]} stroke="#5d6152" tick={{ fontSize: 11 }} />
                <Tooltip
                  cursor={{ fill: "#ffffff08" }}
                  contentStyle={{ background: "#181b15", border: "1px solid #2a2e24", fontFamily: "var(--mono)" }}
                />
                <Bar dataKey="score" radius={[3, 3, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.score >= 7 ? "#7fce8c" : d.score > 0 ? "#e07a5f" : "#2a2e24"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <button className="fade-in-3" onClick={() => navigate("/program")} style={{ marginTop: 8 }}>
            Go to my program →
          </button>
        </>
      )}
    </div>
  );
}
