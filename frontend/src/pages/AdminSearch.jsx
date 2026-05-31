import { useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";

export default function AdminSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const search = async () => {
    if (!q.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await client.get("/admin/users/search", { params: { q: q.trim() } });
      setResults(res.data.users);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Admin · Search User</h1>
      <p className="page-sub">Find a user by id, username, or email.</p>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input
          style={{ flex: 1 }}
          placeholder="user id / username / email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
        />
        <button onClick={search} disabled={loading}>
          {loading ? <span className="spinner" /> : "Search"}
        </button>
      </div>

      {error && <div className="alert err">{error}</div>}

      {results !== null && (
        results.length === 0 ? (
          <div className="alert info">No users found.</div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table>
              <thead>
                <tr>
                  <th>Name</th><th>Username</th><th>Email</th><th>Progress</th>
                </tr>
              </thead>
              <tbody>
                {results.map((u) => {
                  const p = u.progress;
                  return (
                    <tr key={u.id} className="clickable" onClick={() => navigate(`/admin/user/${u.id}`)}>
                      <td>{u.full_name}</td>
                      <td className="muted">{u.username}</td>
                      <td className="muted">{u.email}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div className="progress-track" style={{ width: 90, margin: 0 }}>
                            <div className="progress-fill" style={{ width: `${p.percentage}%` }} />
                          </div>
                          {p.percentage}%
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
