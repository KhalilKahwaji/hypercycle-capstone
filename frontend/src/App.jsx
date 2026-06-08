import { useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Sidebar from "./components/Sidebar";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Assessment from "./pages/Assessment";
import MyProgram from "./pages/MyProgram";
import CurrentTask from "./pages/CurrentTask";
import SubmitWork from "./pages/SubmitWork";
import History from "./pages/History";
import AdminDashboard from "./pages/AdminDashboard";
import AdminUserDetail from "./pages/AdminUserDetail";
import AdminSearch from "./pages/AdminSearch";
import CliTool from "./pages/CliTool";
import Profile from "./pages/Profile";

function Protected({ children, admin = false }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <div className="center-screen">
        <span className="spinner" /> &nbsp; loading…
      </div>
    );
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (admin && !user.is_admin) return <Navigate to="/dashboard" replace />;
  return children;
}

function Shell({ children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <div className="app-shell">
      <header className="mobile-topbar">
        <span className="brand-mobile">Hyper<span>Cycle</span></span>
        <button className="hamburger" onClick={() => setDrawerOpen((o) => !o)} aria-label="Open menu">
          ☰
        </button>
      </header>
      {drawerOpen && <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} />}
      <Sidebar mobileOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <main className="content">{children}</main>
    </div>
  );
}

function Inner() {
  const { user, loading } = useAuth();
  return (
    <Routes>
      <Route
        path="/login"
        element={user && !loading ? <Navigate to={user.is_admin ? "/admin" : "/dashboard"} replace /> : <Login />}
      />
      <Route
        path="/register"
        element={user && !loading ? <Navigate to={user.is_admin ? "/admin" : "/dashboard"} replace /> : <Register />}
      />
      <Route path="/dashboard" element={<Protected><Shell><Dashboard /></Shell></Protected>} />
      <Route path="/assessment" element={<Protected><Shell><Assessment /></Shell></Protected>} />
      <Route path="/program" element={<Protected><Shell><MyProgram /></Shell></Protected>} />
      <Route path="/program/day/:dayId" element={<Protected><Shell><CurrentTask /></Shell></Protected>} />
      <Route path="/submit/:dayId" element={<Protected><Shell><SubmitWork /></Shell></Protected>} />
      <Route path="/history" element={<Protected><Shell><History /></Shell></Protected>} />
      <Route path="/cli" element={<Protected><Shell><CliTool /></Shell></Protected>} />
      <Route path="/profile" element={<Protected><Shell><Profile /></Shell></Protected>} />
      <Route path="/admin" element={<Protected admin><Shell><AdminDashboard /></Shell></Protected>} />
      <Route path="/admin/search" element={<Protected admin><Shell><AdminSearch /></Shell></Protected>} />
      <Route path="/admin/user/:userId" element={<Protected admin><Shell><AdminUserDetail /></Shell></Protected>} />
      <Route path="*" element={<Navigate to={user?.is_admin ? "/admin" : "/dashboard"} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Inner />
    </AuthProvider>
  );
}
