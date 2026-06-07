import { useEffect, useState } from "react";
import { NavLink, Routes, Route, Link, useLocation } from "react-router-dom";
import { MENU } from "../nav.js";
import NowTab from "../tabs/NowTab.jsx";
import ForecastView from "../tabs/ForecastView.jsx";
import UsageSavingsTab from "../tabs/UsageSavingsTab.jsx";
import AlertsTab from "../tabs/AlertsTab.jsx";
import ProfilePage from "../tabs/ProfilePage.jsx";
import PrivacyPage from "../tabs/PrivacyPage.jsx";
import TermsPage from "../tabs/TermsPage.jsx";
import ThemePicker from "./ThemePicker.jsx";
import AccountMenu from "./AccountMenu.jsx";
import GetTheApp from "./GetTheApp.jsx";
import ProtectedRoute from "../auth/ProtectedRoute.jsx";
import "./AppShell.css";

export default function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setMenuOpen(false), [pathname]);

  // Close on Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="app-shell">
      <header className="pp-topbar">
        <button
          type="button"
          className="pp-hamburger"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="pp-drawer"
          onClick={() => setMenuOpen((o) => !o)}
        >
          ☰
        </button>
        <div className="pp-brand">
          <span className="pp-mark" aria-hidden="true">
            ⚡
          </span>
          <span className="pp-brand-text">
            <b>VoltMint</b>
            <span>Hourly pricing, made actionable</span>
          </span>
        </div>

        {/* Desktop top-tab menu */}
        <nav className="pp-topnav" aria-label="Primary">
          {MENU.map((t) => (
            <NavLink
              key={t.key}
              to={t.to}
              end={t.end}
              className={({ isActive }) => `pp-tab${isActive ? " active" : ""}`}
            >
              <span className="ic" aria-hidden="true">
                {t.icon}
              </span>
              {t.label}
            </NavLink>
          ))}
        </nav>

        <div className="pp-top-right">
          <span className="pp-live">
            <span className="pp-dot" aria-hidden="true" />
            Live
          </span>
          <ThemePicker />
          <AccountMenu />
        </div>
      </header>

      {/* Mobile side drawer (opened by the hamburger) */}
      <div
        className={`pp-overlay${menuOpen ? " open" : ""}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />
      <aside
        id="pp-drawer"
        className={`pp-drawer${menuOpen ? " open" : ""}`}
        aria-hidden={!menuOpen}
      >
        <div className="pp-drawer-head">
          <span className="pp-mark" aria-hidden="true">
            ⚡
          </span>
          <b className="pp-drawer-title">VoltMint</b>
          <button
            type="button"
            className="pp-drawer-close"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            ✕
          </button>
        </div>
        <nav className="pp-nav" aria-label="Menu">
          {MENU.map((t) => (
            <NavLink
              key={t.key}
              to={t.to}
              end={t.end}
              className={({ isActive }) => `pp-navlink${isActive ? " active" : ""}`}
            >
              <span className="ic" aria-hidden="true">
                {t.icon}
              </span>
              {t.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="content">
        <Routes>
          <Route path="/" element={<NowTab />} />
          <Route path="/forecast" element={<ForecastView />} />
          <Route
            path="/usage"
            element={
              <ProtectedRoute>
                <UsageSavingsTab />
              </ProtectedRoute>
            }
          />
          <Route
            path="/alerts"
            element={
              <ProtectedRoute>
                <AlertsTab />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
        </Routes>

        <footer className="pp-footer">
          <Link to="/privacy">Privacy</Link>
          <span aria-hidden="true">·</span>
          <Link to="/terms">Terms</Link>
          <span className="pp-footer-copy">VoltMint</span>
          <GetTheApp />
        </footer>
      </main>
    </div>
  );
}
