import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, CheckCircle2, Circle, BookOpen } from "lucide-react";
import client from "../api/client";

function ConfirmDelete({ program, busy, onConfirm, onCancel }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)",
        zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="card fade-in"
        style={{ maxWidth: 440, margin: 0, width: "100%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: 12, color: "var(--red)", display: "flex", alignItems: "center", gap: 8 }}>
          <Trash2 size={18} /> Delete this program?
        </h3>
        <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>
          Deleting <b style={{ color: "var(--text)" }}>{program.title}</b> permanently removes:
        </p>
        <ul style={{ listStyle: "disc", paddingLeft: 20, fontSize: 13, lineHeight: 1.9, color: "var(--text)" }}>
          <li>This program and all of its days</li>
          <li>Its submission history and AI feedback</li>
          <li>Its progress and program-specific badges</li>
        </ul>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 12 }}>
          Your other programs are not affected. This cannot be undone.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button className="ghost" onClick={onCancel} disabled={busy} style={{ flex: 1 }}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            style={{ flex: 1, background: "var(--red)", color: "#fff", borderColor: "var(--red)" }}
          >
            {busy ? <><span className="spinner" /> &nbsp;Deleting…</> : "Delete program"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MyPrograms() {
  const navigate = useNavigate();
  const [programs, setPrograms] = useState([]);
  const [maxPrograms, setMaxPrograms] = useState(3);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const fetchPrograms = useCallback((showSpinner = false) => {
    if (showSpinner) setLoading(true);
    setError("");
    return client
      .get("/programs/mine")
      .then((r) => {
        setPrograms(r.data.programs || []);
        if (r.data.max_programs) setMaxPrograms(r.data.max_programs);
      })
      .catch((e) => setError(e.message || "Failed to load programs."))
      .finally(() => { if (showSpinner) setLoading(false); });
  }, []);

  useEffect(() => { fetchPrograms(true); }, [fetchPrograms]);

  const atMax = programs.length >= maxPrograms;

  const activate = async (id) => {
    setActingId(id);
    setError("");
    try {
      await client.post(`/programs/${id}/activate`);
      await fetchPrograms();
    } catch (e) {
      setError(e.message || "Could not activate program.");
    } finally {
      setActingId(null);
    }
  };

  const doDelete = async () => {
    if (!toDelete) return;
    setDeleteBusy(true);
    setError("");
    try {
      await client.delete(`/programs/${toDelete.id}`);
      setToDelete(null);
      await fetchPrograms();
    } catch (e) {
      setError(e.message || "Could not delete program.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const startNew = () => {
    if (atMax) {
      setError(`You have the maximum of ${maxPrograms} programs. Delete one to create a new one.`);
      return;
    }
    navigate("/assessment");
  };

  if (loading)
    return (
      <div style={{ padding: "60px 0", color: "var(--muted)", display: "flex", alignItems: "center", gap: 10 }}>
        <span className="spinner" /> loading programs…
      </div>
    );

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "flex-start",
        justifyContent: "space-between", gap: 16, flexWrap: "wrap",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="page-title fade-in">My Programs</h1>
          <p className="page-sub fade-in-1">
            You can have up to {maxPrograms} programs. Exactly one is active at a time — the
            active program drives your dashboard, tasks, and CLI.
          </p>
        </div>
        <button
          className="fade-in"
          onClick={startNew}
          disabled={atMax}
          title={atMax ? `Maximum of ${maxPrograms} programs reached` : "Start a new program"}
          style={{ flexShrink: 0, marginTop: 6, display: "flex", alignItems: "center", gap: 8, opacity: atMax ? 0.5 : 1 }}
        >
          <Plus size={16} /> New program
        </button>
      </div>

      {error && <div className="alert err">{error}</div>}

      {programs.length === 0 ? (
        <div className="alert info">
          No programs yet.{" "}
          <span style={{ textDecoration: "underline", cursor: "pointer" }} onClick={() => navigate("/assessment")}>
            Take the self-assessment
          </span>{" "}
          to generate your first personalized program.
        </div>
      ) : (
        programs.map((p, i) => (
          <div
            key={p.id}
            className="card fade-in"
            style={{
              animationDelay: `${Math.min(i * 0.05, 0.3)}s`,
              border: p.is_active ? "1px solid var(--amber)" : "1px solid var(--border)",
              boxShadow: p.is_active ? "0 0 0 2px rgba(139,124,255,0.12)" : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
                  <BookOpen size={17} style={{ color: "var(--cyan)", flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, fontSize: 16 }}>{p.title}</span>
                  {p.is_active && <span className="badge green">Active</span>}
                </div>
                {p.summary && (
                  <p style={{ color: "var(--muted)", fontSize: 13, margin: "2px 0 0", lineHeight: 1.5 }}>
                    {p.summary}
                  </p>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                {p.is_active ? (
                  <button className="ghost" disabled style={{ display: "flex", alignItems: "center", gap: 6, opacity: 0.8 }}>
                    <CheckCircle2 size={15} /> Active
                  </button>
                ) : (
                  <button
                    className="ghost"
                    onClick={() => activate(p.id)}
                    disabled={actingId === p.id}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    {actingId === p.id ? <span className="spinner" /> : <Circle size={15} />} Set active
                  </button>
                )}
                <button
                  className="ghost"
                  onClick={() => setToDelete(p)}
                  title="Delete program"
                  style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--red)", borderColor: "var(--red)" }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {/* Progress */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                <span>{p.completed_days} / {p.total_days} days</span>
                <span>{p.percentage}%</span>
              </div>
              <div style={{ height: 7, borderRadius: 999, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
                <div style={{
                  width: `${p.percentage}%`, height: "100%", borderRadius: 999,
                  background: "linear-gradient(90deg, var(--cyan), var(--amber))",
                  transition: "width 0.4s ease",
                }} />
              </div>
            </div>

            {p.is_active && (
              <div style={{ marginTop: 14 }}>
                <button className="ghost" onClick={() => navigate("/program")} style={{ fontSize: 13 }}>
                  Open program →
                </button>
              </div>
            )}
          </div>
        ))
      )}

      {toDelete && (
        <ConfirmDelete
          program={toDelete}
          busy={deleteBusy}
          onConfirm={doDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
