import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchUsers = useCallback(() => {
    setLoading(true);
    client
      .get("/admin/users", { params: { limit, offset } })
      .then((r) => {
        setUsers(r.data.users);
        setTotal(r.data.total);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [limit, offset]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const totalPages = Math.ceil(total / limit) || 1;
  const currentPage = Math.floor(offset / limit) + 1;

  if (error) return <div className="alert err">{error}</div>;

  const active = users.filter((u) => u.progress.has_program);
  const stuck = active.filter((u) => u.progress.percentage > 0 && u.progress.percentage < 100);

  return (
    <div>
      <h1 className="page-title">Admin · All Users</h1>
      <p className="page-sub">Everyone in the program and where they are.</p>

      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        <div className="metric"><div className="label">Total users</div><div className="value">{total}</div></div>
        <div className="metric"><div className="label">With a program</div><div className="value">{active.length}</div></div>
        <div className="metric"><div className="label">In progress</div><div className="value">{stuck.length}</div></div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <span className="muted" style={{ fontSize: 13 }}>{total} total users</span>
        <div style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 12, marginRight: 4 }}>Per page:</span>
        {[10, 20, 50].map((n) => (
          <button
            key={n}
            className={limit === n ? "" : "ghost"}
            style={{ padding: "4px 12px" }}
            onClick={() => { setLimit(n); setOffset(0); }}
          >
            {n}
          </button>
        ))}
      </div>

      {loading ? (
        <div><span className="spinner" /> loading users…</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th>User</th><th>Email</th><th>Program</th><th>Progress</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const p = u.progress;
                let badge = <span className="badge locked">No program</span>;
                if (p.has_program) {
                  if (p.percentage === 100) badge = <span className="badge green">Finished</span>;
                  else if (p.percentage > 0) badge = <span className="badge amber">In progress</span>;
                  else badge = <span className="badge locked">Not started</span>;
                }
                return (
                  <tr key={u.id} className="clickable" onClick={() => navigate(`/admin/user/${u.id}`)}>
                    <td>
                      {u.full_name}{u.is_admin && <span className="badge amber" style={{ marginLeft: 6 }}>admin</span>}
                    </td>
                    <td className="muted">{u.email}</td>
                    <td className="muted">{p.has_program ? "Yes" : "—"}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div className="progress-track" style={{ width: 90, margin: 0 }}>
                          <div className="progress-fill" style={{ width: `${p.percentage}%` }} />
                        </div>
                        {p.percentage}%
                      </div>
                    </td>
                    <td>{badge}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 16, justifyContent: "flex-end" }}>
        <button
          className="ghost"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - limit))}
        >
          Prev
        </button>
        <span className="muted" style={{ fontSize: 13 }}>
          Page {currentPage} of {totalPages}
        </span>
        <button
          className="ghost"
          disabled={offset + limit >= total}
          onClick={() => setOffset(offset + limit)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
