import { useEffect, useState } from "react";
import client from "../api/client";
import FeedbackCard from "../components/FeedbackCard";

export default function History() {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    client.get("/submissions/me")
      .then((r) => setSubs(r.data.submissions))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div><span className="spinner" /> loading history…</div>;

  return (
    <div>
      <h1 className="page-title">Submission History</h1>
      <p className="page-sub">Every attempt and its AI feedback.</p>

      {subs.length === 0 && <div className="alert info">No submissions yet.</div>}

      {subs.map((s) => {
        const fb = s.feedback;
        const isOpen = open === s.id;
        return (
          <div key={s.id} className="card">
            <div
              style={{ display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}
              onClick={() => setOpen(isOpen ? null : s.id)}
            >
              <div className="day-num" style={{ minWidth: 40, fontSize: 20 }}>
                D{s.day_number}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}>
                  {new Date(s.created_at).toLocaleString()}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {s.content.slice(0, 90)}{s.content.length > 90 ? "…" : ""}
                </div>
              </div>
              {fb && (
                <span className={`badge ${fb.passed ? "green" : "red"}`}>
                  {fb.score}/10 {fb.passed ? "pass" : "fail"}
                </span>
              )}
            </div>

            {isOpen && (
              <div style={{ marginTop: 16 }}>
                {s.file_url && (
                  <p style={{ marginBottom: 10 }}>
                    📎 <a href={s.file_url} target="_blank" rel="noreferrer">uploaded file</a>
                  </p>
                )}
                {fb ? <FeedbackCard feedback={fb} /> : <p className="muted">No feedback recorded.</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
