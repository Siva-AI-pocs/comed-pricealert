import { useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import AuthModal from "./AuthModal.jsx";
import "./AccountMenu.css";

export default function AccountMenu() {
  const { status, user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  if (status === "loading") {
    return <div className="account-menu" aria-hidden="true" />;
  }

  if (status === "authenticated") {
    return (
      <div className="account-menu">
        <span className="account-email" title={user.email}>
          {user.email}
        </span>
        <button className="account-btn" onClick={logout}>
          Log out
        </button>
      </div>
    );
  }

  return (
    <div className="account-menu">
      <button className="account-btn primary" onClick={() => setOpen(true)}>
        Log in
      </button>
      <AuthModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
