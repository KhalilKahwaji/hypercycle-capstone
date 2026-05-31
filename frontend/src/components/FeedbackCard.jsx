function List({ items, variant }) {
  const arr = (items || "").split("\n").map((s) => s.trim()).filter(Boolean);
  if (!arr.length) return <p className="muted" style={{ fontSize: 13 }}>—</p>;
  return (
    <ul className={`fb-list ${variant || ""}`}>
      {arr.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

export default function FeedbackCard({ feedback }) {
  if (!feedback) return null;
  const passed = feedback.passed;
  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 14 }}>
        <div className={`score-ring ${passed ? "pass" : "fail"}`}>{feedback.score}</div>
        <div>
          <span className={`badge ${passed ? "green" : "red"}`}>
            {passed ? "Passed" : "Needs work"}
          </span>
          <p style={{ marginTop: 8, fontSize: 14 }}>{feedback.summary}</p>
        </div>
      </div>

      <div className="grid grid-2">
        <div>
          <h3 style={{ color: "var(--green)" }}>Strengths</h3>
          <List items={feedback.strengths} variant="good" />
        </div>
        <div>
          <h3 style={{ color: "var(--red)" }}>Issues</h3>
          <List items={feedback.issues} variant="bad" />
        </div>
      </div>

      {!passed && (
        <>
          <h3 style={{ marginTop: 18, color: "var(--amber)" }}>Required fixes</h3>
          <List items={feedback.required_fixes} />
        </>
      )}

      <h3 style={{ marginTop: 18 }}>Next steps</h3>
      <List items={feedback.next_steps} />
    </div>
  );
}
