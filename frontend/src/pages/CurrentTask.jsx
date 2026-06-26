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

function RepoLinker({ onLinked }) {
  const [repoUrl, setRepoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  const linkRepo = async () => {
    if (!repoUrl.trim()) { setError("Enter a GitHub repo URL."); return; }
    setError(""); setBusy(true);
    try {
      const res = await client.post("/programs/link-repo", { github_url: repoUrl.trim() });
      setSuccess(res.data);
      onLinked(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setBusy(false);
    }
  };

  if (success) {
    return (
      <div className="alert ok" style={{ fontSize: 14 }}>
        Linked <strong>{success.owner}/{success.repo}</strong>
        {success.subfolder ? ` (/${success.subfolder})` : ""}. GitHub submissions are now enabled.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {error && <div className="alert err" style={{ fontSize: 13 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <input
          type="text"
          placeholder="https://github.com/you/your-project"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && linkRepo()}
          style={{ flex: 1 }}
        />
        <button onClick={linkRepo} disabled={busy} style={{ transform: "none", whiteSpace: "nowrap" }}>
          {busy ? <><span className="spinner" /> Verifying…</> : "Link repo"}
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        Private and public repos supported. You can update this link later.
      </p>
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
  const [linkedRepo, setLinkedRepo] = useState(null);
  const [ghConnected, setGhConnected] = useState(null);

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

    // Load linked repo info and GitHub connection status for Day 0
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

  const markSetupComplete = async () => {
    setSetupBusy(true);
    try {
      await client.post(`/program-days/${day.id}/complete-setup`);
      setSetupDone(true);
      setDay((d) => ({ ...d, is_completed: true }));
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
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

      {day.day_number === 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ color: "var(--amber)", marginBottom: 6 }}>Complete setup</h3>
          <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
            Complete both steps below before marking Day 0 done.
          </p>

          {/* Step 1 — Connect GitHub */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{
                width: 22, height: 22, borderRadius: "50%", display: "inline-flex",
                alignItems: "center", justifyContent: "center", flexShrink: 0,
                fontSize: 11, fontWeight: 700,
                background: ghConnected ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.06)",
                color: ghConnected ? "var(--green)" : "var(--faint)",
                border: `1px solid ${ghConnected ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.1)"}`,
              }}>
                {ghConnected ? "✓" : "1"}
              </span>
              <strong style={{ fontSize: 14 }}>Connect GitHub</strong>
              {ghConnected === null && <span className="spinner" style={{ width: 12, height: 12, marginLeft: 4 }} />}
              {ghConnected === true && (
                <span style={{ fontSize: 12, color: "var(--green)", marginLeft: "auto" }}>Connected</span>
              )}
              {ghConnected === false && (
                <a
                  href="/profile"
                  style={{ fontSize: 13, color: "var(--cyan)", marginLeft: "auto", textDecoration: "none" }}
                >
                  Go to Profile →
                </a>
              )}
            </div>
            {ghConnected === false && (
              <p className="muted" style={{ fontSize: 12, margin: "0 0 0 32px" }}>
                Go to your Profile page and connect your GitHub account to enable repo submissions.
              </p>
            )}
          </div>

          {/* Step 2 — Link repo */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{
                width: 22, height: 22, borderRadius: "50%", display: "inline-flex",
                alignItems: "center", justifyContent: "center", flexShrink: 0,
                fontSize: 11, fontWeight: 700,
                background: linkedRepo ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.06)",
                color: linkedRepo ? "var(--green)" : "var(--faint)",
                border: `1px solid ${linkedRepo ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.1)"}`,
              }}>
                {linkedRepo ? "✓" : "2"}
              </span>
              <strong style={{ fontSize: 14 }}>Link your GitHub project repo</strong>
            </div>
            <div style={{ marginLeft: 32 }}>
              <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
                The evaluator will read your code directly — no copy-pasting needed.
              </p>
              {linkedRepo ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div className="alert ok" style={{ fontSize: 14 }}>
                    Linked <strong>{linkedRepo.owner}/{linkedRepo.repo}</strong>
                    {linkedRepo.subfolder ? ` (/${linkedRepo.subfolder})` : ""}.
                  </div>
                  <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                    To update, paste a new URL and click Link repo again.
                  </p>
                  <RepoLinker onLinked={(r) => setLinkedRepo(r)} />
                </div>
              ) : (
                <RepoLinker onLinked={(r) => setLinkedRepo(r)} />
              )}
            </div>
          </div>
        </div>
      )}

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
          <>
            <button
              onClick={markSetupComplete}
              disabled={setupBusy || !ghConnected || !linkedRepo}
              title={
                !ghConnected
                  ? "Connect your GitHub account first"
                  : !linkedRepo
                  ? "Link your repo above first"
                  : ""
              }
            >
              {setupBusy ? <><span className="spinner" /> &nbsp;Completing…</> : "Mark setup complete ✓"}
            </button>
            {(!ghConnected || !linkedRepo) && (
              <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>
                Complete both steps above to unlock.
              </span>
            )}
          </>
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
