import { describe, expect, it } from "vitest";
import { normalizePageSpeedResponse } from "./client";

describe("normalizePageSpeedResponse", () => {
  it("normalizes category scores, metric values and bounded evidence", () => {
    const result = normalizePageSpeedResponse({
      id: "https://example.com/",
      version: { major: "5", minor: "0" },
      lighthouseResult: {
        requestedUrl: "https://example.com/",
        finalUrl: "https://example.com/",
        fetchTime: "2026-10-14T10:00:00Z",
        lighthouseVersion: "13.0.0",
        categories: { performance: { score: 0.823 }, seo: { score: null } },
        audits: {
          "largest-contentful-paint": { numericValue: 2400, numericUnit: "millisecond", score: 0.8, scoreDisplayMode: "numeric", title: "LCP" },
          "server-response-time": { numericValue: 500, numericUnit: "millisecond", score: 0.2, scoreDisplayMode: "numeric", title: "Server response" },
          "unused-javascript": { score: 0, scoreDisplayMode: "numeric", title: "Reduce unused JS", description: "Opportunity" },
          "cumulative-layout-shift": { score: 1, scoreDisplayMode: "numeric", numericValue: 0.03, numericUnit: "unitless" },
        },
        runWarnings: ["Page had issues"],
      },
    });

    expect(result.categories.performance).toBe(82);
    expect(result.categories.seo).toBeNull();
    expect(result.metrics["largest-contentful-paint"]?.value).toBe(2400);
    expect(result.metrics["time-to-first-byte"]?.auditId).toBe("server-response-time");
    expect(result.metrics["cumulative-layout-shift"]?.unit).toBe("unitless");
    expect(result.metrics["interaction-to-next-paint"]).toBeUndefined();
    expect(result.evidence.map((item) => item.id)).toContain("unused-javascript");
    expect(result.warnings).toEqual(["Page had issues"]);
  });
});
