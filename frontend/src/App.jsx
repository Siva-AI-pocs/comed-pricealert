import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "./theme/ThemeContext.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import AppShell from "./components/AppShell.jsx";

// Router basename follows the Vite base (e.g. "/app" in staging, "/" at
// cutover) so client-side routes resolve under whatever path FastAPI serves.
const BASENAME = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter
          basename={BASENAME}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <AppShell />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
