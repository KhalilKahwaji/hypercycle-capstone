import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import client from "../api/client";
import FeedbackCard from "../components/FeedbackCard";

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ color: "var(--amber)" }}>{label}</h3>
      <p style={{ whiteSpace: "pre-wrap" }}>{value}</p>
    </div>
  );
}

export default function CurrentTask() {
  const { dayId } = useParams();
  const navigate = useNavigate();
  const [day, setDay] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupDone, setSetupDone] = useState(false);

  useEffect(() => {
    client
      .get(`/program-days/${dayId}`)
      .then((r) => {
        const d = r.data.day;
        setDay(d);
        if (d.is_completed) {
          return client
            .get(`/program-days/${dayId}/feedback`)
            .then((fb) => setFeedback(fb.data.feedback));
        }
      })
      .catch((e) => setError(e.message));
  }, [dayId]);

  const markSetupComplete = async () => {
    setSetupBusy(true);
    try {
      await client.post(`/program-days/${day.id}/complete-setup`);
      setSetupDone(true);
      setDay((d) => ({ ...d, is_completed: true }));
    } catch (e) {
      setError(e.message);
    } finally {
      setSetupBusy(false);
    }
  };

  if (error) return <div className="alert err">{error}</div>;
  if (!day) return <div><span className="spinner" /> loading task…</div>;

  const topics = (day.research_topics || "").split("\n").filter(Boolean);

  return (
    <div>
      <p className="muted" style={{ letterSpacing: 2, textTransform: "uppercase", fontSize: 11 }}>
        Day {day.day_number}
        {day.is_completed && <span className="badge green" style={{ marginLeft: 10 }}>Completed</span>}
      </p>
      <h1 className="page-title">{day.title}</h1>
      <p className="page-sub">{day.objective}</p>

      <div className="card">
        {topics.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ color: "var(--amber)" }}>Research topics</h3>
            <ul className="fb-list">
              {topics.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
        )}
        <Field label="Task" value={day.task_description} />
        <Field label="Expected output (shippable)" value={day.expected_output} />
        <Field label="Evaluation criteria" value={day.evaluation_criteria} />
        <div style={{ display: "flex", gap: 24 }} className="muted">
          <span>~{day.estimated_hours} hrs estimated</span>
          <span>{day.unlock_condition}</span>
        </div>
      </div>

      {day.is_completed && (
        <>
          <h2 className="section-title">Feedback</h2>
          {feedback
            ? <FeedbackCard feedback={feedback} />
            : <p className="muted" style={{ fontSize: 13 }}>This day was marked complete.</p>}
        </>
      )}

      <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
        {!day.is_completed && day.day_number === 0 && (
          <button onClick={markSetupComplete} disabled={setupBusy}>
            {setupBusy ? <><span className="spinner" /> &nbsp;Completing…</> : "Mark setup complete ✓"}
          </button>
        )}
        {!day.is_completed && day.day_number > 0 && (
          <button onClick={() => navigate(`/submit/${day.id}`)}>Submit work for this day →</button>
        )}
        {setupDone && (
          <span className="badge green" style={{ alignSelf: "center" }}>Setup done — Day 1 unlocked!</span>
        )}
        <button className="ghost" onClick={() => navigate("/program")}>Back to program</button>
      </div>
    </div>
  );
}
