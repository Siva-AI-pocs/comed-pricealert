import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import AuthModal from "./AuthModal.jsx";
import "./AccountMenu.css";

export default function AccountMenu() {
  const { status, user, logout } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [menuOpen]);

  if (status === "loading") {
    return <div className="account-menu" aria-hidden="true" />;
  }

  if (status === "authenticated") {
    return (
      <div className="account-menu" ref={ref}>
        <button
          type="button"
          className="account-trigger"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span className="account-email" title={user.email}>{user.email}</span>
          <span aria-hidden="true">▾</span>
        </button>
        {menuOpen && (
          <div className="account-pop" role="menu">
            <Link
              className="account-pop-item"
              role="menuitem"
              to="/profile"
              onClick={() => setMenuOpen(false)}
            >
              Profile
            </Link>
            <button
              type="button"
              className="account-pop-item"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                logout();
              }}
            >
              Log out
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="account-menu">
      <button className="account-btn primary" onClick={() => setLoginOpen(true)}>
        Log in
      </button>
      <AuthModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}
