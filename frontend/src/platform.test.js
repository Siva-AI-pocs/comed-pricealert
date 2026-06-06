import { describe, it, expect } from "vitest";
import { detectPlatform } from "./platform.js";

describe("detectPlatform", () => {
  it("detects Android", () => {
    expect(
      detectPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36"),
    ).toBe("android");
  });
  it("detects iPhone", () => {
    expect(
      detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"),
    ).toBe("ios");
  });
  it("detects iPad (legacy UA)", () => {
    expect(
      detectPlatform("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15"),
    ).toBe("ios");
  });
  it("treats desktop as other", () => {
    expect(
      detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"),
    ).toBe("other");
  });
  it("defaults to other for an empty UA", () => {
    expect(detectPlatform("")).toBe("other");
  });
});
