import { useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import Select from "../components/Select.jsx";
import "../components/AuthForm.css"; // reuses .auth-form / .auth-error / .auth-notice / .auth-submit
import "./ProfilePage.css";

const US_TIMEZONES = [
  ["America/Chicago", "Central — Chicago"],
  ["America/New_York", "Eastern — New York"],
  ["America/Denver", "Mountain — Denver"],
  ["America/Los_Angeles", "Pacific — Los Angeles"],
  ["America/Phoenix", "Arizona — Phoenix"],
  ["America/Anchorage", "Alaska — Anchorage"],
  ["Pacific/Honolulu", "Hawaii — Honolulu"],
];

function Status({ error, notice }) {
  if (error) return <p className="auth-error" role="alert">{error}</p>;
  if (notice) return <p className="auth-notice" role="status">{notice}</p>;
  return null;
}

const msg = (err) => err.detail || err.message || "Something went wrong.";

export default function ProfilePage() {
  const { user, updateProfile, changeEmail, changePassword, logout } = useAuth();

  const [name, setName] = useState(user?.name ?? "");
  const [timezone, setTimezone] = useState(user?.timezone ?? "America/Chicago");
  const [pState, setPState] = useState({ busy: false, error: "", notice: "" });

  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [eState, setEState] = useState({ busy: false, error: "", notice: "" });

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwState, setPwState] = useState({ busy: false, error: "", notice: "" });

  async function saveProfile(e) {
    e.preventDefault();
    setPState({ busy: true, error: "", notice: "" });
    try {
      await updateProfile({ name, timezone });
      setPState({ busy: false, error: "", notice: "Profile saved." });
    } catch (err) {
      setPState({ busy: false, error: msg(err), notice: "" });
    }
  }

  async function saveEmail(e) {
    e.preventDefault();
    setEState({ busy: true, error: "", notice: "" });
    try {
      await changeEmail(newEmail, emailPassword);
      setNewEmail("");
      setEmailPassword("");
      setEState({ busy: false, error: "", notice: "Email updated." });
    } catch (err) {
      setEState({ busy: false, error: msg(err), notice: "" });
    }
  }

  async function savePassword(e) {
    e.preventDefault();
    setPwState({ busy: true, error: "", notice: "" });
    try {
      await changePassword(oldPassword, newPassword);
      setOldPassword("");
      setNewPassword("");
      setPwState({ busy: false, error: "", notice: "Password changed." });
    } catch (err) {
      setPwState({ busy: false, error: msg(err), notice: "" });
    }
  }

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString()
    : "—";

  return (
    <div className="profile-page">
      <h1 className="profile-h1">Your account</h1>

      <section className="profile-card">
        <h2>Profile</h2>
        <form onSubmit={saveProfile} className="auth-form" noValidate>
          <Status error={pState.error} notice={pState.notice} />
          <label htmlFor="pf-name">Display name</label>
          <input
            id="pf-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label htmlFor="pf-tz">Timezone</label>
          <Select
            id="pf-tz"
            ariaLabel="Timezone"
            value={timezone}
            onChange={setTimezone}
            options={US_TIMEZONES}
          />
          <button className="auth-submit" type="submit" disabled={pState.busy}>
            {pState.busy ? "Working…" : "Save profile"}
          </button>
        </form>
      </section>

      <section className="profile-card">
        <h2>Email</h2>
        <p className="profile-current">Current: {user?.email}</p>
        <form onSubmit={saveEmail} className="auth-form" noValidate>
          <Status error={eState.error} notice={eState.notice} />
          <label htmlFor="pf-email">New email</label>
          <input
            id="pf-email"
            type="email"
            autoComplete="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
          />
          <label htmlFor="pf-email-pw">Confirm current password</label>
          <input
            id="pf-email-pw"
            type="password"
            autoComplete="current-password"
            value={emailPassword}
            onChange={(e) => setEmailPassword(e.target.value)}
            required
          />
          <button className="auth-submit" type="submit" disabled={eState.busy}>
            {eState.busy ? "Working…" : "Update email"}
          </button>
        </form>
      </section>

      <section className="profile-card">
        <h2>Password</h2>
        <form onSubmit={savePassword} className="auth-form" noValidate>
          <Status error={pwState.error} notice={pwState.notice} />
          <label htmlFor="pf-old">Current password</label>
          <input
            id="pf-old"
            type="password"
            autoComplete="current-password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            required
          />
          <label htmlFor="pf-new">New password</label>
          <input
            id="pf-new"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <button className="auth-submit" type="submit" disabled={pwState.busy}>
            {pwState.busy ? "Working…" : "Change password"}
          </button>
        </form>
      </section>

      <section className="profile-card">
        <h2>Account</h2>
        <p className="profile-current">Member since {memberSince}</p>
        <button className="auth-submit" type="button" onClick={logout}>
          Log out
        </button>
      </section>
    </div>
  );
}
