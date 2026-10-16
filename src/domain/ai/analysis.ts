import { z } from "zod";

export const ANALYSIS_SCHEMA_VERSION = "1";

export const analysisSchema = z.object({
  summary: z.string().min(1).max(700),
  recommendations: z.array(z.object({
    priority: z.enum(["high", "medium", "low"]),
    title: z.string().min(1).max(160),
    rationale: z.string().min(1).max(700),
    expectedImpact: z.string().min(1).max(300),
    evidenceIds: z.array(z.string().min(1).max(100)).min(1).max(5),
    uncertainty: z.string().min(1).max(300),
  }).strict()).max(5),
  overallUncertainty: z.string().min(1).max(500),
}).strict();

export type RootCauseAnalysis = z.infer<typeof analysisSchema>;

export const analysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "recommendations", "overallUncertainty"],
  properties: {
    summary: { type: "string" },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["priority", "title", "rationale", "expectedImpact", "evidenceIds", "uncertainty"],
        properties: {
          priority: { type: "string", enum: ["high", "medium", "low"] },
          title: { type: "string" },
          rationale: { type: "string" },
          expectedImpact: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" } },
          uncertainty: { type: "string" },
        },
      },
    },
    overallUncertainty: { type: "string" },
  },
} as const;

export function validateGroundedAnalysis(value: unknown, allowedEvidenceIds: ReadonlySet<string>): RootCauseAnalysis {
  const parsed = analysisSchema.parse(value);
  for (const recommendation of parsed.recommendations) {
    if (recommendation.evidenceIds.some((id) => !allowedEvidenceIds.has(id))) {
      throw new Error("Analysis referenced evidence that was not supplied.");
    }
  }
  return parsed;
}
