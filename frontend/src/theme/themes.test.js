import { describe, it, expect } from "vitest";
import { THEMES, BRANDS, MODES, DEFAULT_BRAND, DEFAULT_MODE, TOKEN_KEYS } from "./themes";

describe("THEMES", () => {
  it("ships the three brands, Voltaic default", () => {
    expect(BRANDS).toEqual(["voltaic", "grid", "volt"]);
    expect(DEFAULT_BRAND).toBe("voltaic");
  });

  it("supports light (default) + dark", () => {
    expect(MODES).toEqual(["light", "dark"]);
    expect(DEFAULT_MODE).toBe("light");
  });

  it("each brand has a name and both light + dark variants", () => {
    for (const brand of BRANDS) {
      expect(typeof THEMES[brand].name).toBe("string");
      expect(THEMES[brand].light).toBeTruthy();
      expect(THEMES[brand].dark).toBeTruthy();
    }
  });

  it("every variant defines all design tokens with non-empty values", () => {
    for (const brand of BRANDS) {
      for (const mode of MODES) {
        const variant = THEMES[brand][mode];
        for (const key of TOKEN_KEYS) {
          expect(variant[key], `${brand}.${mode}.${key}`).toMatch(/^#|^rgb|^hsl/);
        }
      }
    }
  });

  // Brand accent must never equal a price-tier color (CLAUDE.md design rule),
  // so a brand accent is never mistaken for a price signal.
  it("brand accent differs from every price tier in all variants", () => {
    const tierKeys = ["--neg", "--cheap", "--moderate", "--high", "--spike"];
    for (const brand of BRANDS) {
      for (const mode of MODES) {
        const v = THEMES[brand][mode];
        for (const tk of tierKeys) {
          expect(
            v["--accent"].toLowerCase(),
            `${brand}.${mode} accent vs ${tk}`,
          ).not.toBe(v[tk].toLowerCase());
        }
      }
    }
  });
});
