import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import client from "../api/client";
import FeedbackCard from "../components/FeedbackCard";

const ACCEPT = ".txt,.md,.py,.json,.pdf";

export default function SubmitWork() {
  const { dayId } = useParams();
  const navigate = useNavigate();
  const [day, setDay] = useState(null);
  const [content, setContent] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    client.get(`/program-days/${dayId}`).then((r) => setDay(r.data.day)).catch((e) => setError(e.message));
  }, [dayId]);

  const submit = async () => {
    setError(""); setResult(null);
    if (!content.trim()) {
      setError("Describe what you did. This is what gets evaluated.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("program_day_id", dayId);
      fd.append("content", content);
      if (file) fd.append("file", file);

      // File analysis + Groq evaluation happen server-side in one call.
      const res = await client.post("/submissions", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Submit Work</h1>
      <p className="page-sub">
        {day ? `Day ${day.day_number} — ${day.title}` : "…"}
      </p>

      {error && <div className="alert err">{error}</div>}

      {!result && (
        <div className="card">
          <label>What did you build / complete?</label>
          <textarea
            placeholder="Explain what you did, decisions you made, and anything you struggled with."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            style={{ minHeight: 160 }}
          />

          <label>Optional file (evidence)</label>
          <input type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files[0] || null)} />
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Accepted: .txt .md .py .json .pdf · max 5MB · uploaded files are auto-analyzed and fed
            into the evaluation.
          </p>

          <button className="full" style={{ marginTop: 20 }} onClick={submit} disabled={busy}>
            {busy ? <><span className="spinner" /> &nbsp;Analyzing & evaluating…</> : "Submit for evaluation"}
          </button>
        </div>
      )}

      {result && (
        <>
          <div className={`alert ${result.evaluation.passed ? "ok" : "err"}`}>
            {result.evaluation.passed
              ? "Passed! The next day has been unlocked."
              : "Not passed yet — review the feedback and resubmit."}
          </div>

          <FeedbackCard feedback={result.feedback} />

          {result.submission.file_analysis && (
            <div className="card">
              <h3>File analysis</h3>
              <div className="mono-block">
                {JSON.stringify(result.submission.file_analysis, null, 2)}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 12 }}>
            {result.evaluation.passed ? (
              <button onClick={() => navigate("/program")}>Back to program →</button>
            ) : (
              <button onClick={() => { setResult(null); setContent(""); setFile(null); }}>
                Resubmit
              </button>
            )}
            <button className="ghost" onClick={() => navigate("/history")}>View history</button>
          </div>
        </>
      )}
    </div>
  );
}
