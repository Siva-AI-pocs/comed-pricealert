import { useAuth } from "./AuthContext.jsx";
import AuthForm from "../components/AuthForm.jsx";

/**
 * Gates protected pages (Usage & Savings, Alerts, Account). While the session
 * is resolving it shows a spinner; when anonymous it renders the login view in
 * place (not a 404/redirect), per the auth requirements; when authenticated it
 * renders the page.
 */
export default function ProtectedRoute({ children }) {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <div style={{ padding: 40, color: "var(--dim)" }} aria-busy="true">
        Loading…
      </div>
    );
  }

  if (status === "anonymous") {
    return (
      <div className="protected-gate" style={{ padding: "24px 0", maxWidth: 380 }}>
        <p style={{ color: "var(--dim)", marginTop: 0 }}>
          Please log in to access this page.
        </p>
        <AuthForm />
      </div>
    );
  }

  return children;
}
