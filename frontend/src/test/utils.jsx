import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../theme/ThemeContext.jsx";

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

/**
 * Render a component wrapped in the app's providers (ThemeProvider + Router).
 * `route` sets the initial location. Returns Testing Library's render result.
 */
export function renderWithProviders(ui, { route = "/" } = {}) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[route]} future={ROUTER_FUTURE}>
        {ui}
      </MemoryRouter>
    </ThemeProvider>,
  );
}
