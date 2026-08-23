import { describe, expect, it } from "vitest";
import { computeFlash } from "./motion";

describe("computeFlash", () => {
  it("reports up when the value genuinely increased", () => {
    expect(computeFlash(100, 101)).toBe("up");
  });

  it("reports down when the value genuinely decreased", () => {
    expect(computeFlash(100, 99)).toBe("down");
  });

  it("reports no flash when the value is unchanged", () => {
    expect(computeFlash(100, 100)).toBeNull();
  });

  it("never fabricates a direction when there is no prior real value", () => {
    expect(computeFlash(null, 100)).toBeNull();
  });

  it("never flashes on non-finite input", () => {
    expect(computeFlash(NaN, 100)).toBeNull();
    expect(computeFlash(100, NaN)).toBeNull();
    expect(computeFlash(100, Infinity)).toBeNull();
  });
});
