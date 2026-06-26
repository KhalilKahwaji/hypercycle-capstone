import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function GitHubCallback() {
  const [params] = useSearchParams();
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    const token = params.get("token");
    const isNew = params.get("new") === "true";
    const githubError = params.get("github");

    if (githubError === "error") {
      const reason = params.get("reason") || "unknown";
      setError(`GitHub sign-in failed (${reason}). Please try again.`);
      return;
    }

    if (!token) {
      setError("No token received from GitHub. Please try again.");
      return;
    }

    // Clear the URL immediately so the token doesn't linger in browser history
    window.history.replaceState({}, "", "/auth/callback");

    loginWithToken(token)
      .then((user) => {
        sessionStorage.setItem("sensei_pending_event", "login");
        if (user?.is_admin) {
          navigate("/admin", { replace: true });
        } else if (isNew) {
          navigate("/onboarding", { replace: true });
        } else {
          navigate("/dashboard", { replace: true });
        }
      })
      .catch(() => {
        setError("Could not load your account after GitHub sign-in. Please try again.");
      });
  }, []);

  if (error) {
    return (
      <div className="center-screen">
        <div className="card center" style={{ maxWidth: 400 }}>
          <div className="alert err">{error}</div>
          <button onClick={() => navigate("/login")} style={{ marginTop: 12, transform: "none" }}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="center-screen">
      <div style={{ textAlign: "center", color: "var(--faint)" }}>
        <span className="spinner" />
        <p style={{ marginTop: 12, fontSize: 14 }}>Signing you in…</p>
      </div>
    </div>
  );
}
