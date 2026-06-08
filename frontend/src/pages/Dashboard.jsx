import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip,
} from "recharts";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useSensei } from "../context/SenseiContext";
import ProgressRing from "../components/ProgressRing";
import useCountUp from "../hooks/useCountUp";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { triggerRevive } = useSensei();
  const [senseiDismissed, setSenseiDismissed] = useState(
    () => { try { return localStorage.getItem("sensei_dismissed") === "1"; } catch { return false; } }
  );
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
      <div style={{ padding: "60px 0", color: "var(--muted)", display: "flex", alignItems: "center", gap: 12 }}>
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
          {/* Hero zone — progress ring as focal point */}
          <div className="db-hero fade-in-1">
            <div className="db-ring-wrap">
              <ProgressRing pct={progress.percentage} size={160} stroke={12} />
            </div>
            <div className="db-hero-right">
              <div className="db-stat-row">
                <div className="metric">
                  <div className="label">Days completed</div>
                  <div className="value">{completedCount}</div>
                </div>
                <div className="metric">
                  <div className="label">Total days</div>
                  <div className="value">{totalCount}</div>
                </div>
              </div>
              {estimatedFinish && (
                <div className="db-finish">
                  Est. completion
                  <strong>{estimatedFinish}</strong>
                  <span>based on {assessment?.hours_per_week}h / week</span>
                </div>
              )}
            </div>
          </div>

          <h2 className="section-title fade-in-2">Score by day</h2>
          <div className="card fade-in-2" style={{ height: 260, padding: "20px 16px 16px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barCategoryGap="35%">
                <XAxis
                  dataKey="day"
                  stroke="rgba(255,255,255,0.12)"
                  tick={{ fontSize: 11, fill: "var(--faint)", fontFamily: "var(--mono)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 10]}
                  stroke="rgba(255,255,255,0.06)"
                  tick={{ fontSize: 11, fill: "var(--faint)", fontFamily: "var(--mono)" }}
                  axisLine={false}
                  tickLine={false}
                  width={24}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)", radius: 4 }}
                  contentStyle={{
                    background: "rgba(10,11,20,0.95)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    fontFamily: "var(--mono)",
                    fontSize: 12,
                    color: "var(--text)",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                  }}
                  labelStyle={{ color: "var(--muted)", marginBottom: 4 }}
                />
                <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell
                      key={i}
                      fill={
                        d.score >= 7
                          ? "url(#bar-pass)"
                          : d.score > 0
                          ? "rgba(248,113,113,0.7)"
                          : "rgba(255,255,255,0.06)"
                      }
                    />
                  ))}
                </Bar>
                <defs>
                  <linearGradient id="bar-pass" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4dd0ff" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#6d5efc" stopOpacity={0.8} />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <button className="fade-in-3" onClick={() => navigate("/program")} style={{ marginTop: 8 }}>
            Go to my program →
          </button>
        </>
      )}

      {senseiDismissed && (
        <div style={{ marginTop: 40, paddingTop: 18, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 14 }}>
          <span className="muted" style={{ fontSize: 12 }}>HyperSensei is dismissed.</span>
          <button
            className="ghost"
            style={{ fontSize: 12, padding: "6px 14px" }}
            onClick={() => { setSenseiDismissed(false); triggerRevive(); }}
          >
            Summon HyperSensei
          </button>
        </div>
      )}
    </div>
  );
}
