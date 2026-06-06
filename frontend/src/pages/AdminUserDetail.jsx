import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import client from "../api/client";
import FeedbackCard from "../components/FeedbackCard";

function DayDetail({ d }) {
  const topics = (d.research_topics || "").split("\n").filter(Boolean);
  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 12 }}>
      {d.objective && (
        <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 14 }}>{d.objective}</p>
      )}
      {topics.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--faint)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
            Research topics
          </div>
          <ul className="fb-list">
            {topics.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}
      {d.task_description && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--faint)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
            Task
          </div>
          <p style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{d.task_description}</p>
        </div>
      )}
      {d.expected_output && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--faint)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
            Expected output
          </div>
          <p style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{d.expected_output}</p>
        </div>
      )}
      {d.evaluation_criteria && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--faint)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
            Evaluation criteria
          </div>
          <p style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{d.evaluation_criteria}</p>
        </div>
      )}
      <div style={{ display: "flex", gap: 24, color: "var(--muted)", fontSize: 12 }}>
        {d.estimated_hours && <span>⏱ ~{d.estimated_hours} hrs</span>}
        {d.unlock_condition && <span>🔓 {d.unlock_condition}</span>}
      </div>
    </div>
  );
}

export default function AdminUserDetail() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [prog, setProg] = useState(null);
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openSub, setOpenSub] = useState(null);
  const [expandedDay, setExpandedDay] = useState(null);
  const [passForm, setPassForm] = useState({ dayId: null, score: 7, summary: "", err: "", busy: false });

  const load = () => {
    setLoading(true);
    Promise.all([
      client.get(`/admin/users/${userId}/progress`),
      client.get(`/admin/users/${userId}/submissions`),
    ])
      .then(([p, s]) => { setProg(p.data); setSubs(s.data.submissions); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [userId]);

  const toggleDay = (id) => setExpandedDay((prev) => (prev === id ? null : id));

  const openPass = (dayId) =>
    setPassForm(passForm.dayId === dayId
      ? { dayId: null, score: 7, summary: "", err: "", busy: false }
      : { dayId, score: 7, summary: "", err: "", busy: false });

  const handlePass = async (dayId) => {
    if (!passForm.summary.trim()) {
      setPassForm((f) => ({ ...f, err: "Feedback is required." }));
      return;
    }
    setPassForm((f) => ({ ...f, busy: true, err: "" }));
    try {
      await client.post(`/admin/program-days/${dayId}/pass`, {
        score: passForm.score,
        summary: passForm.summary,
      });
      setPassForm({ dayId: null, score: 7, summary: "", err: "", busy: false });
      load();
    } catch (e) {
      setPassForm((f) => ({ ...f, busy: false, err: e.message }));
    }
  };

  if (loading) return <div><span className="spinner" /> loading…</div>;

  return (
    <div>
      <button className="ghost" onClick={() => navigate("/admin")} style={{ marginBottom: 18 }}>
        ← All users
      </button>
      <h1 className="page-title">User detail</h1>
      <p className="page-sub">Progress and submission feedback.</p>

      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        <div className="metric"><div className="label">Completed</div><div className="value">{prog.progress.completed_days}</div></div>
        <div className="metric"><div className="label">Total</div><div className="value">{prog.progress.total_days}</div></div>
        <div className="metric"><div className="label">Progress</div><div className="value">{prog.progress.percentage}%</div></div>
      </div>

      <h2 className="section-title">Program days</h2>
      {!prog.days.length && <div className="alert info">No program generated yet.</div>}
      {prog.days.map((d) => {
        const state = d.is_completed ? "completed" : d.is_unlocked ? "unlocked" : "locked";
        const isExpanded = expandedDay === d.id;
        const isPassOpen = passForm.dayId === d.id;

        return (
          <div key={d.id}>
            {/* Card header — click anywhere to expand/collapse day details */}
            <div
              className={`day-card ${state}`}
              style={{ cursor: "pointer", flexWrap: "wrap" }}
              onClick={() => toggleDay(d.id)}
            >
              <div className="day-num">{String(d.day_number).padStart(2, "0")}</div>
              <div className="day-body">
                <div className="t">{d.title}</div>
                {d.objective && !isExpanded && (
                  <div className="o">{d.objective}</div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                {d.is_completed
                  ? <span className="badge green">Done</span>
                  : d.is_unlocked
                    ? <span className="badge amber">Active</span>
                    : <span className="badge locked">Locked</span>}
                <span className="muted" style={{ fontSize: 11 }}>{isExpanded ? "▲" : "▼"}</span>
                {!d.is_completed && (
                  <button
                    className="ghost"
                    style={{ fontSize: 12, padding: "3px 10px" }}
                    onClick={(e) => { e.stopPropagation(); openPass(d.id); }}
                  >
                    {isPassOpen ? "Cancel" : "Pass this day"}
                  </button>
                )}
              </div>

              {/* Expanded day detail — inside the card, full width */}
              {isExpanded && (
                <div style={{ width: "100%" }} onClick={(e) => e.stopPropagation()}>
                  <DayDetail d={d} />
                </div>
              )}
            </div>

            {/* Pass form — below the card */}
            {isPassOpen && (
              <div className="card" style={{ marginTop: 0, marginBottom: 12, borderTop: "none", borderRadius: "0 0 4px 4px" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
                  <label style={{ margin: 0 }}>Score (1–10)</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={passForm.score}
                    style={{ width: 64 }}
                    onChange={(e) => setPassForm((f) => ({ ...f, score: Number(e.target.value) }))}
                  />
                </div>
                <label>Feedback</label>
                <textarea
                  rows={3}
                  value={passForm.summary}
                  onChange={(e) => setPassForm((f) => ({ ...f, summary: e.target.value }))}
                  placeholder="Write your feedback for this day…"
                />
                {passForm.err && <div className="alert err" style={{ marginTop: 8 }}>{passForm.err}</div>}
                <button
                  style={{ marginTop: 10 }}
                  disabled={passForm.busy}
                  onClick={() => handlePass(d.id)}
                >
                  {passForm.busy ? <span className="spinner" /> : "Confirm pass"}
                </button>
              </div>
            )}
          </div>
        );
      })}

      <h2 className="section-title">Submissions</h2>
      {subs.length === 0 && <div className="alert info">No submissions.</div>}
      {subs.map((s) => {
        const isOpen = openSub === s.id;
        return (
          <div key={s.id} className="card">
            <div style={{ display: "flex", gap: 14, alignItems: "center", cursor: "pointer" }}
              onClick={() => setOpenSub(isOpen ? null : s.id)}>
              <div className="day-num" style={{ minWidth: 40, fontSize: 20 }}>D{s.day_number}</div>
              <div style={{ flex: 1 }} className="muted">{new Date(s.created_at).toLocaleString()}</div>
              {s.feedback && (
                <span className={`badge ${s.feedback.passed ? "green" : "red"}`}>
                  {s.feedback.score}/10
                </span>
              )}
            </div>
            {isOpen && (
              <div style={{ marginTop: 14 }}>
                <div className="mono-block" style={{ marginBottom: 12 }}>{s.content}</div>
                {s.file_url && <p style={{ marginBottom: 10 }}>📎 <a href={s.file_url} target="_blank" rel="noreferrer">file</a></p>}
                {s.feedback && <FeedbackCard feedback={s.feedback} />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
