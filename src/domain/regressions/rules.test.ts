import { describe, expect, it } from "vitest";
import { detectRegression } from "./rules";

describe("detectRegression", () => {
  it("detects deterioration only when both configured thresholds are crossed", () => {
    expect(detectRegression(1000, 1150, { direction: "higher_is_worse", absoluteThreshold: 100, relativeThresholdPercent: 10 }))
      .toEqual({ delta: 150, relativeChangePercent: 15, severity: "moderate" });
    expect(detectRegression(1000, 1050, { direction: "higher_is_worse", absoluteThreshold: 100, relativeThresholdPercent: 10 })).toBeNull();
  });

  it("handles lower-is-worse metrics and ignores improvements", () => {
    expect(detectRegression(90, 80, { direction: "lower_is_worse", absoluteThreshold: 5, relativeThresholdPercent: 7 })?.severity).toBe("moderate");
    expect(detectRegression(80, 90, { direction: "lower_is_worse", absoluteThreshold: 5 })).toBeNull();
  });

  it("uses absolute-only thresholds where configured", () => {
    expect(detectRegression(0.03, 0.055, { direction: "higher_is_worse", absoluteThreshold: 0.02 })).toEqual({
      delta: 0.025,
      relativeChangePercent: 83.33333333333334,
      severity: "moderate",
    });
  });

  it("does not calculate a percentage from a zero baseline", () => {
    expect(detectRegression(0, 200, { direction: "higher_is_worse", absoluteThreshold: 100, relativeThresholdPercent: 10 })).toBeNull();
  });

  it("includes exact threshold boundaries and marks large changes high", () => {
    const policy = { direction: "higher_is_worse" as const, absoluteThreshold: 100, relativeThresholdPercent: 10 };
    expect(detectRegression(1000, 1100, policy)?.severity).toBe("moderate");
    expect(detectRegression(1000, 1200, policy)?.severity).toBe("high");
  });

  it("does not create regressions from missing or non-finite values", () => {
    expect(detectRegression(Number.NaN, 1, { direction: "higher_is_worse", absoluteThreshold: 0.1 })).toBeNull();
    expect(detectRegression(1, Number.POSITIVE_INFINITY, { direction: "higher_is_worse", absoluteThreshold: 0.1 })).toBeNull();
  });
});
