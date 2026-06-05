import { Link } from "react-router-dom";

// "More" gathers account, theme, Usage & Savings (on mobile), and legal links.
// Theme picker + account actions are added in later tasks.
export default function MoreTab() {
  return (
    <section data-testid="tab-more">
      <h2>More</h2>
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
