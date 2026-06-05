import { describe, it, expect } from "vitest";
import { cents, deltaPct } from "./format.js";

describe("cents", () => {
  it("formats a number to one decimal with a ¢ suffix", () => {
    expect(cents(1.7)).toBe("1.7¢");
    expect(cents(0)).toBe("0.0¢");
    expect(cents(-2.34)).toBe("-2.3¢");
  });
  it("renders an em dash for null/undefined/NaN", () => {
    expect(cents(null)).toBe("—");
    expect(cents(undefined)).toBe("—");
    expect(cents(NaN)).toBe("—");
  });
});

describe("deltaPct", () => {
  it("returns the signed percentage difference from a baseline", () => {
    expect(deltaPct(2, 4)).toBe(-50); // 50% below
    expect(deltaPct(6, 4)).toBe(50); // 50% above
  });
  it("returns null when the baseline is missing or zero", () => {
    expect(deltaPct(2, 0)).toBeNull();
    expect(deltaPct(2, null)).toBeNull();
    expect(deltaPct(null, 4)).toBeNull();
  });
});
