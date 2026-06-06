import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, useTheme } from "./ThemeContext";
import { THEMES, STORAGE_KEY } from "./themes";

function Probe() {
  const { brand, mode, setBrand, toggleMode } = useTheme();
  return (
    <div>
      <span data-testid="brand">{brand}</span>
      <span data-testid="mode">{mode}</span>
      <button onClick={() => setBrand("grid")}>set-grid</button>
      <button onClick={toggleMode}>toggle</button>
    </div>
  );
}

const accentOf = () =>
  document.documentElement.style.getPropertyValue("--accent");

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-brand");
});

describe("ThemeProvider", () => {
  it("defaults to Voltaic light and applies its tokens to the root", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("brand")).toHaveTextContent("voltaic");
    expect(screen.getByTestId("mode")).toHaveTextContent("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-brand")).toBe("voltaic");
    expect(accentOf()).toBe(THEMES.voltaic.light["--accent"]);
  });

  it("switching brand re-applies that brand's tokens", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await user.click(screen.getByText("set-grid"));
    expect(screen.getByTestId("brand")).toHaveTextContent("grid");
    expect(document.documentElement.getAttribute("data-brand")).toBe("grid");
    expect(accentOf()).toBe(THEMES.grid.light["--accent"]);
  });

  it("toggling mode switches light<->dark and persists the choice", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await user.click(screen.getByText("toggle"));
    expect(screen.getByTestId("mode")).toHaveTextContent("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(accentOf()).toBe(THEMES.voltaic.dark["--accent"]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toMatchObject({
      mode: "dark",
    });
  });

  it("restores a persisted brand + mode on mount", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ brand: "volt", mode: "dark" }),
    );
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("brand")).toHaveTextContent("volt");
    expect(screen.getByTestId("mode")).toHaveTextContent("dark");
    expect(accentOf()).toBe(THEMES.volt.dark["--accent"]);
  });
});
