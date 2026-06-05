import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "./theme/ThemeContext.jsx";
import AppShell from "./components/AppShell.jsx";

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AppShell />
      </BrowserRouter>
    </ThemeProvider>
  );
}
