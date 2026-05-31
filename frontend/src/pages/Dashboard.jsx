import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip,
} from "recharts";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [progress, setProgress] = useState(null);
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([
      client.get("/progress/me"),
      client.get("/submissions/me"),
    ])
      .then(([p, s]) => {
        setProgress(p.data);
        setSubs(s.data.submissions);
      })
      .catch((e) => setError(e.message || "Failed to load dashboard."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading)
    return <div><span className="spinner" /> loading dashboard…</div>;

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

  // Best score per day_number for the chart.
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
      <h1 className="page-title">Welcome, {user?.full_name?.split(" ")[0]}.</h1>
      <p className="page-sub">Here's where you stand.</p>

      {!progress?.has_program ? (
        <div className="alert info">
          You don't have a program yet.{" "}
          <Link to="/assessment">Take the self-assessment</Link> to generate one.
        </div>
      ) : (
        <>
          <div className="grid grid-3" style={{ marginBottom: 24 }}>
            <div className="metric">
              <div className="label">Completed days</div>
              <div className="value">{progress.completed_days}</div>
            </div>
            <div className="metric">
              <div className="label">Total days</div>
              <div className="value">{progress.total_days}</div>
            </div>
            <div className="metric">
              <div className="label">Progress</div>
              <div className="value">{progress.percentage}%</div>
            </div>
          </div>

          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress.percentage}%` }} />
          </div>

          <h2 className="section-title">Score by day</h2>
          <div className="card" style={{ height: 260 }}>
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

          <button onClick={() => navigate("/program")} style={{ marginTop: 8 }}>
            Go to my program →
          </button>
        </>
      )}
    </div>
  );
}
