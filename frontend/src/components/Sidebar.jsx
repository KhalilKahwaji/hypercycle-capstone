import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        Hyper<span>Cycle</span>
      </div>
      <div className="brand-sub">self-driving bootcamp</div>

      {user?.is_admin ? (
        <>
          <div className="nav-section-label">Admin</div>
          <NavLink to="/admin" className="nav-link">All Users</NavLink>
          <NavLink to="/admin/search" className="nav-link">Search User</NavLink>
        </>
      ) : (
        <>
          <div className="nav-section-label">Learn</div>
          <NavLink to="/dashboard" className="nav-link">Dashboard</NavLink>
          <NavLink to="/assessment" className="nav-link">Self-Assessment</NavLink>
          <NavLink to="/program" className="nav-link">My Program</NavLink>
          <NavLink to="/history" className="nav-link">Submission History</NavLink>
        </>
      )}

      <div className="spacer" />

      <div className="user-chip">
        <b>{user?.full_name}</b>
        {user?.email}
      </div>
      <button className="ghost full" onClick={handleLogout}>
        Log out
      </button>
    </aside>
  );
}
