import { useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { authApi } from "../api/auth.js";
import "./AuthForm.css";

/**
 * Multi-mode auth form: login / register / forgot / reset.
 * Used both inside AuthModal and inline by ProtectedRoute.
 * `onSuccess` fires after a successful login or registration.
 */
export default function AuthForm({ initialMode = "login", onSuccess }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const go = (next) => {
    setMode(next);
    setError("");
    setNotice("");
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email, password);
        onSuccess?.();
      } else if (mode === "register") {
        await register(email, password);
        onSuccess?.();
      } else if (mode === "forgot") {
        await authApi.forgotPassword(email);
        setNotice("Reset code sent — check your inbox.");
        setMode("reset");
      } else if (mode === "reset") {
        await authApi.resetPassword(email, code, password);
        setNotice("Password reset — you can now log in.");
        setMode("login");
        setPassword("");
        setCode("");
      }
    } catch (err) {
      setError(err.detail || err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const titles = {
    login: "Log in",
    register: "Create your account",
    forgot: "Reset your password",
    reset: "Enter your reset code",
  };
  const submitLabels = {
    login: "Log in",
    register: "Sign up",
    forgot: "Send reset code",
    reset: "Reset password",
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <h3 className="auth-title">{titles[mode]}</h3>

      {notice && (
        <p className="auth-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      <label htmlFor="auth-email">Email</label>
      <input
        id="auth-email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      {mode === "reset" && (
        <>
          <label htmlFor="auth-code">Reset code</label>
          <input
            id="auth-code"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </>
      )}

      {mode !== "forgot" && (
        <>
          <label htmlFor="auth-password">
            {mode === "reset" ? "New password" : "Password"}
          </label>
          <input
            id="auth-password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </>
      )}

      <button className="auth-submit" type="submit" disabled={busy}>
        {busy ? "Working…" : submitLabels[mode]}
      </button>

      <div className="auth-links">
        {mode === "login" && (
          <>
            <button type="button" className="auth-link" onClick={() => go("register")}>
              Create account
            </button>
            <button type="button" className="auth-link" onClick={() => go("forgot")}>
              Forgot password?
            </button>
          </>
        )}
        {mode !== "login" && (
          <button type="button" className="auth-link" onClick={() => go("login")}>
            Back to log in
          </button>
        )}
      </div>
    </form>
  );
}
