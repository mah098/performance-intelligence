export type RegressionDirection = "higher_is_worse" | "lower_is_worse";

export type RegressionPolicy = {
  direction: RegressionDirection;
  absoluteThreshold: number;
  relativeThresholdPercent?: number;
};

export type RegressionResult = {
  delta: number;
  relativeChangePercent: number | null;
  severity: "moderate" | "high";
} | null;

export function detectRegression(before: number, after: number, policy: RegressionPolicy): RegressionResult {
  if (!Number.isFinite(before) || !Number.isFinite(after) || !Number.isFinite(policy.absoluteThreshold) || policy.absoluteThreshold <= 0) return null;
  const delta = after - before;
  const deterioration = policy.direction === "higher_is_worse" ? delta > 0 : delta < 0;
  if (!deterioration) return null;

  const magnitude = Math.abs(delta);
  const relativeChangePercent = before === 0 ? null : magnitude / Math.abs(before) * 100;
  if (magnitude < policy.absoluteThreshold) return null;
  if (policy.relativeThresholdPercent !== undefined && (relativeChangePercent === null || relativeChangePercent < policy.relativeThresholdPercent)) return null;

  const highAbsolute = magnitude >= policy.absoluteThreshold * 2;
  const highRelative = policy.relativeThresholdPercent === undefined
    || (relativeChangePercent !== null && relativeChangePercent >= policy.relativeThresholdPercent * 2);
  return { delta, relativeChangePercent, severity: highAbsolute && highRelative ? "high" : "moderate" };
}
