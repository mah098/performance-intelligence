import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCruxFieldData, normalizeCruxRecord } from "./client";

describe("normalizeCruxRecord", () => {
  it("normalizes p75, units, window and histograms without inventing absent metrics", () => {
    const result = normalizeCruxRecord({
      record: {
        key: { formFactor: "PHONE", url: "https://example.com/page" },
        collectionPeriod: { firstDate: { year: 2026, month: 9, day: 15 }, lastDate: { year: 2026, month: 10, day: 12 } },
        metrics: {
          largest_contentful_paint: { percentiles: { p75: 2400 }, histogram: [{ start: 0, end: 2500, density: 0.9 }, { start: 2500, density: 0.1 }] },
          cumulative_layout_shift: { percentiles: { p75: "0.12" }, histogram: [{ start: 0, end: 0.1, density: 0.7 }] },
        },
      },
      urlNormalizationDetails: { normalizedUrl: "https://example.com/page" },
    });
    expect(result?.scope).toBe("page");
    expect(result?.formFactor).toBe("PHONE");
    expect(result?.collectionPeriod).toEqual({ firstDate: "2026-09-15", lastDate: "2026-10-12" });
    expect(result?.metrics.largest_contentful_paint).toEqual({ p75: 2400, unit: "ms", histogram: [{ start: 0, end: 2500, density: 0.9 }, { start: 2500, density: 0.1 }] });
    expect(result?.metrics.cumulative_layout_shift?.unit).toBe("unitless");
    expect(result?.metrics.interaction_to_next_paint).toBeUndefined();
    expect(result?.normalizedUrl).toBe("https://example.com/page");
  });

  it("preserves origin scope and no-record responses", () => {
    expect(normalizeCruxRecord({ record: { key: { formFactor: "DESKTOP", origin: "https://example.com" }, metrics: {} } })?.scope).toBe("origin");
    expect(normalizeCruxRecord({ error: { code: 404 } })).toBeNull();
  });
});

describe("getCruxFieldData provider boundary", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
    process.env.CRUX_API_KEY = "test-key";
  });

  it("keeps page no-data separate and requests an origin fallback", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        record: {
          key: { formFactor: "PHONE", origin: "https://example.com" },
          collectionPeriod: { firstDate: { year: 2026, month: 9, day: 1 }, lastDate: { year: 2026, month: 9, day: 28 } },
          metrics: { interaction_to_next_paint: { percentiles: { p75: 180 }, histogram: [] } },
        },
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCruxFieldData("https://example.com/page", "PHONE");

    expect(result.status).toBe("available");
    expect(result.page).toBeNull();
    expect(result.originFallback?.scope).toBe("origin");
    expect(result.originFallback?.metrics.interaction_to_next_paint?.p75).toBe(180);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody).toMatchObject({ url: "https://example.com/page", formFactor: "PHONE" });
  });
});
