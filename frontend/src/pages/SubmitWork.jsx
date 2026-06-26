import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";
import client from "../api/client";
import FeedbackCard from "../components/FeedbackCard";
import BadgeToast from "../components/BadgeToast";
import { useSensei } from "../context/SenseiContext";

export default function SubmitWork() {
  const { dayId } = useParams();
  const navigate = useNavigate();
  const { triggerEvent } = useSensei();

  const [day, setDay] = useState(null);
  const [linkedRepo, setLinkedRepo] = useState(null);
  const [ghConnected, setGhConnected] = useState(null);

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [newBadges, setNewBadges] = useState([]);

  useEffect(() => {
    client.get(`/program-days/${dayId}`).then((r) => setDay(r.data.day)).catch((e) => setError(e.message));
    client.get("/programs/me").then((r) => {
      const prog = r.data.program;
      if (prog?.github_owner && prog?.github_repo) {
        setLinkedRepo({ owner: prog.github_owner, repo: prog.github_repo, subfolder: prog.github_subfolder || "" });
      }
    }).catch(() => {});
    client.get("/auth/github/status")
      .then((r) => setGhConnected(r.data.connected))
      .catch(() => setGhConnected(false));
  }, [dayId]);

  const handleResult = (data) => {
    setResult(data);
    if (data.evaluation?.passed) {
      const dayNum = day?.day_number ?? 0;
      if (dayNum >= 15) {
        const fire = (origin) => confetti({ particleCount: 90, spread: 70, origin, startVelocity: 45 });
        fire({ x: 0.25, y: 0.65 });
        setTimeout(() => fire({ x: 0.75, y: 0.65 }), 180);
        setTimeout(() => fire({ x: 0.5, y: 0.6 }), 360);
      } else {
        confetti({ particleCount: 55, spread: 60, origin: { y: 0.7 } });
      }
    }
    const earned = data.new_badges || [];
    if (earned.length) {
      setNewBadges(earned);
      setTimeout(() => setNewBadges([]), 6000);
    }
    const passed = data.evaluation?.passed;
    const score = data.feedback?.score ?? 0;
    if (passed) triggerEvent(score >= 10 ? "perfect10" : "pass");
    else triggerEvent("fail");
    if (earned.length) setTimeout(() => triggerEvent("badge_earned"), passed ? 8000 : 4000);
  };

  const submitGitHub = async () => {
    setError(""); setResult(null);
    setBusy(true);
    try {
      const res = await client.post("/submissions/github", { program_day_id: dayId });
      handleResult(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Submit Work</h1>
      <p className="page-sub">{day ? `Day ${day.day_number} — ${day.title}` : "…"}</p>

      {error && <div className="alert err">{error}</div>}

      {!result && (
        <div className="card">
          {ghConnected === null ? (
            <div style={{ color: "var(--faint)", fontSize: 14 }}>
              <span className="spinner" /> &nbsp;Loading…
            </div>
          ) : !ghConnected ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>GitHub account not connected</div>
              <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
                Connect your GitHub account on your Profile page to enable repo-based submissions.
              </p>
              <button onClick={() => navigate("/profile")} style={{ transform: "none" }}>
                Go to Profile →
              </button>
            </div>
          ) : !linkedRepo ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>No repo linked</div>
              <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
                Link your GitHub project repo on Day 0 before submitting.
              </p>
              <button className="ghost" onClick={() => navigate("/program")} style={{ transform: "none" }}>
                Go to My Program →
              </button>
            </div>
          ) : (
            <>
              <div style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 16px",
                background: "rgba(77,208,255,0.06)",
                border: "1px solid rgba(77,208,255,0.2)",
                borderRadius: "var(--radius)",
                marginBottom: 16, fontSize: 14,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: "var(--cyan)" }}>
                    {linkedRepo.owner}/{linkedRepo.repo}
                    {linkedRepo.subfolder && (
                      <span className="muted"> /{linkedRepo.subfolder}</span>
                    )}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    The evaluator will read your latest pushed code directly.
                  </div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 9px",
                  borderRadius: 99, flexShrink: 0,
                  background: "rgba(74,222,128,0.1)",
                  color: "var(--green)",
                  border: "1px solid rgba(74,222,128,0.22)",
                }}>
                  OAuth ✓
                </span>
              </div>
              <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
                Make sure you've pushed your latest work before submitting.
              </p>
              <button
                className="full"
                style={{ transform: "none" }}
                onClick={submitGitHub}
                disabled={busy}
              >
                {busy
                  ? <><span className="spinner" /> &nbsp;Fetching code & evaluating…</>
                  : "Submit via GitHub →"}
              </button>
            </>
          )}
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
              <h3>Submission details</h3>
              <div className="mono-block">
                {JSON.stringify(result.submission.file_analysis, null, 2)}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 12 }}>
            {result.evaluation.passed ? (
              <button onClick={() => navigate("/program")}>Back to program →</button>
            ) : (
              <button onClick={() => { setResult(null); setError(""); }}>Resubmit</button>
            )}
            <button className="ghost" onClick={() => navigate("/history")}>View history</button>
          </div>
        </>
      )}

      <BadgeToast badges={newBadges} onDismiss={() => setNewBadges([])} />
    </div>
  );
}
