import { ThemeProvider } from "./theme/ThemeContext.jsx";

// Minimal shell — the tabbed AppShell, routing, and tabs land in subsequent
// frontend-foundation tasks. This bootstraps the React app + theme system.
export default function App() {
  return (
    <ThemeProvider>
      <main style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
        <h1 style={{ fontWeight: 800 }}>⚡ ComEd Price Pulse</h1>
        <p style={{ color: "var(--dim)" }}>
          React shell + theme system online. Tabs coming next.
        </p>
      </main>
    </ThemeProvider>
  );
}
