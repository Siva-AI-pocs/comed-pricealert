import { describe, it, expect } from "vitest";
import { PWA_MANIFEST } from "./manifest.js";

const HEX = /^#[0-9a-f]{6}$/i;

describe("PWA_MANIFEST", () => {
  it("identifies the app with name + a short_name that fits the home screen", () => {
    expect(PWA_MANIFEST.name).toBe("ComEd Price Pulse");
    expect(PWA_MANIFEST.short_name).toBe("Price Pulse");
    // Android truncates the launcher label past ~12 chars.
    expect(PWA_MANIFEST.short_name.length).toBeLessThanOrEqual(12);
    expect(PWA_MANIFEST.description).toMatch(/price/i);
  });

  it("installs as a standalone app scoped to the SPA mount (/app/)", () => {
    expect(PWA_MANIFEST.display).toBe("standalone");
    // The SPA is served by FastAPI under /app/ during staging.
    expect(PWA_MANIFEST.start_url).toBe("/app/");
    expect(PWA_MANIFEST.scope).toBe("/app/");
  });

  it("brands the splash + browser chrome with valid hex colors", () => {
    expect(PWA_MANIFEST.theme_color).toMatch(HEX);
    expect(PWA_MANIFEST.background_color).toMatch(HEX);
  });

  it("ships the icon sizes Android/iOS need, including a maskable icon", () => {
    const icons = PWA_MANIFEST.icons || [];
    const sizes = icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(icons.every((i) => i.type === "image/png")).toBe(true);
    expect(icons.some((i) => (i.purpose || "").includes("maskable"))).toBe(true);
    // maskable + any 512 icon must be referenced under the /app/ base.
    expect(icons.every((i) => i.src.startsWith("/app/"))).toBe(true);
  });
});
