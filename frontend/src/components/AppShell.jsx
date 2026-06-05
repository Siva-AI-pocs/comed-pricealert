import { NavLink, Routes, Route } from "react-router-dom";
import { TABS, MOBILE_TABS } from "../nav.js";
import NowTab from "../tabs/NowTab.jsx";
import ForecastView from "../tabs/ForecastView.jsx";
import UsageSavingsTab from "../tabs/UsageSavingsTab.jsx";
import AlertsTab from "../tabs/AlertsTab.jsx";
import MoreTab from "../tabs/MoreTab.jsx";
import PrivacyPage from "../tabs/PrivacyPage.jsx";
import TermsPage from "../tabs/TermsPage.jsx";
import ThemePicker from "./ThemePicker.jsx";
import "./AppShell.css";

export default function AppShell() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ⚡
          </span>
          <span className="brand-name">ComEd Price Pulse</span>
        </div>
        <nav className="topnav" aria-label="Primary">
          {TABS.map((t) => (
            <NavLink key={t.key} to={t.to} end={t.end} className="topnav-link">
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar-theme">
          <ThemePicker />
        </div>
      </header>

      <main className="content">
        <Routes>
          <Route path="/" element={<NowTab />} />
          <Route path="/forecast" element={<ForecastView />} />
          <Route path="/usage" element={<UsageSavingsTab />} />
          <Route path="/alerts" element={<AlertsTab />} />
          <Route path="/more" element={<MoreTab />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
        </Routes>
      </main>

      <nav className="bottomnav" aria-label="Bottom">
        {MOBILE_TABS.map((t) => (
          <NavLink key={t.key} to={t.to} end={t.end} className="bottomnav-link">
            <span className="bottomnav-icon" aria-hidden="true">
              {t.icon}
            </span>
            <span className="bottomnav-label">{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
