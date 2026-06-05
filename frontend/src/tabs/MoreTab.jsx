import { Link } from "react-router-dom";
import ThemePicker from "../components/ThemePicker.jsx";

// "More" gathers account, theme, Usage & Savings (on mobile), and legal links.
// Account actions are added in later tasks.
export default function MoreTab() {
  return (
    <section data-testid="tab-more">
      <h2>More</h2>
      <div style={{ margin: "12px 0 20px" }}>
        <h3 style={{ fontSize: 14, color: "var(--faint)", margin: "0 0 8px" }}>
          Theme
        </h3>
        <ThemePicker />
      </div>
      <ul style={{ color: "var(--dim)" }}>
        <li>
          <Link to="/usage">Usage &amp; Savings</Link>
        </li>
        <li>
          <Link to="/privacy">Privacy</Link>
        </li>
        <li>
          <Link to="/terms">Terms</Link>
        </li>
      </ul>
    </section>
  );
}
