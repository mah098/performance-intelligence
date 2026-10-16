import { describe, expect, it } from "vitest";
import { validateGroundedAnalysis } from "./analysis";

const valid = {
  summary: "LCP increased between these runs.",
  recommendations: [{ priority: "medium", title: "Review the hero image", rationale: "The image is a candidate to inspect.", expectedImpact: "May reduce LCP if confirmed.", evidenceIds: ["current:largest-contentful-paint"], uncertainty: "The supplied evidence does not identify causation." }],
  overallUncertainty: "Run-to-run differences do not establish deployment causation.",
};

describe("validateGroundedAnalysis", () => {
  it("accepts structured recommendations that cite supplied evidence", () => {
    expect(validateGroundedAnalysis(valid, new Set(["current:largest-contentful-paint"]))).toEqual(valid);
  });

  it("rejects evidence IDs the model was not given", () => {
    expect(() => validateGroundedAnalysis(valid, new Set(["previous:largest-contentful-paint"]))).toThrow(/not supplied/);
  });

  it("rejects missing evidence references and unknown properties", () => {
    expect(() => validateGroundedAnalysis({ ...valid, recommendations: [{ ...valid.recommendations[0], evidenceIds: [] }] }, new Set())).toThrow();
    expect(() => validateGroundedAnalysis({ ...valid, hidden_claim: true }, new Set(["current:largest-contentful-paint"]))).toThrow();
  });
});
