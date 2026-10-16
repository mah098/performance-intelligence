import { getServerEnv } from "@/server/env";
import { readBoundedResponseText, ResponseTooLargeError } from "@/server/bounded-response";

const CRUX_ENDPOINT = "https://chromeuxreport.googleapis.com/v1/records:queryRecord";
const FIELD_METRICS = [
  "largest_contentful_paint",
  "interaction_to_next_paint",
  "cumulative_layout_shift",
  "first_contentful_paint",
  "experimental_time_to_first_byte",
] as const;

function parseRetryAfter(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : undefined;
}

type CruxMetric = { p75: number; unit: "ms" | "unitless"; histogram: { start: number; end?: number; density: number }[] };
export type CruxRecord = {
  scope: "page" | "origin";
  identifier: string;
  formFactor: "PHONE" | "DESKTOP";
  collectionPeriod: { firstDate: string; lastDate: string } | null;
  metrics: Record<string, CruxMetric>;
  normalizedUrl?: string;
};
export type FieldDataResult = {
  status: "available" | "no_data" | "not_configured" | "unavailable";
  formFactor: "PHONE" | "DESKTOP";
  page: CruxRecord | null;
  originFallback: CruxRecord | null;
  errorCode?: string;
};

export class CruxError extends Error {
  constructor(message: string, readonly code: string, readonly retryable: boolean, readonly retryAfterMs?: number) {
    super(message);
    this.name = "CruxError";
  }
}

function dateFromParts(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const date = value as { year?: unknown; month?: unknown; day?: unknown };
  if (![date.year, date.month, date.day].every((part) => typeof part === "number")) return null;
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

export function normalizeCruxRecord(payload: unknown): CruxRecord | null {
  if (!payload || typeof payload !== "object") throw new CruxError("CrUX returned an invalid response.", "invalid_response", false);
  const root = payload as Record<string, unknown>;
  const record = root.record as Record<string, unknown> | undefined;
  if (!record) return null;
  const key = record.key as Record<string, unknown> | undefined;
  const formFactor = key?.formFactor === "DESKTOP" ? "DESKTOP" : "PHONE";
  const scope = typeof key?.origin === "string" ? "origin" : "page";
  const identifier = typeof key?.url === "string" ? key.url : typeof key?.origin === "string" ? key.origin : "";
  const rawMetrics = (record.metrics ?? {}) as Record<string, unknown>;
  const metrics: Record<string, CruxMetric> = {};

  for (const keyName of FIELD_METRICS) {
    const raw = rawMetrics[keyName] as { percentiles?: { p75?: unknown }; histogram?: unknown } | undefined;
    const p75Raw = raw?.percentiles?.p75;
    const p75 = typeof p75Raw === "number" ? p75Raw : typeof p75Raw === "string" ? Number(p75Raw) : NaN;
    if (!Number.isFinite(p75)) continue;
    const histogram = Array.isArray(raw?.histogram)
      ? raw.histogram.flatMap((bin) => {
          if (!bin || typeof bin !== "object") return [];
          const item = bin as { start?: unknown; end?: unknown; density?: unknown };
          if (typeof item.start !== "number" || typeof item.density !== "number") return [];
          return [{ start: item.start, ...(typeof item.end === "number" ? { end: item.end } : {}), density: item.density }];
        }).slice(0, 6)
      : [];
    metrics[keyName] = { p75, unit: keyName === "cumulative_layout_shift" ? "unitless" : "ms", histogram };
  }

  const period = record.collectionPeriod as { firstDate?: unknown; lastDate?: unknown } | undefined;
  const firstDate = dateFromParts(period?.firstDate);
  const lastDate = dateFromParts(period?.lastDate);
  const normalization = root.urlNormalizationDetails as { normalizedUrl?: unknown } | undefined;
  return {
    scope,
    identifier,
    formFactor,
    collectionPeriod: firstDate && lastDate ? { firstDate, lastDate } : null,
    metrics,
    normalizedUrl: typeof normalization?.normalizedUrl === "string" ? normalization.normalizedUrl.slice(0, 2048) : undefined,
  };
}

async function queryCrux(identifier: string, scope: "url" | "origin", formFactor: "PHONE" | "DESKTOP", key: string): Promise<CruxRecord | null> {
  const endpoint = new URL(CRUX_ENDPOINT);
  endpoint.searchParams.set("key", key);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ [scope]: identifier, formFactor, metrics: FIELD_METRICS }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      const retryAfterMs = parseRetryAfter(response);
      throw new CruxError(
        response.status === 429 ? "CrUX request quota reached." : `CrUX returned HTTP ${response.status}.`,
        response.status === 429 ? "provider_rate_limited" : `provider_http_${response.status}`,
        response.status === 429 || response.status >= 500,
        retryAfterMs,
      );
    }
    let text: string;
    try { text = await readBoundedResponseText(response, 1024 * 1024); }
    catch (error) {
      if (error instanceof ResponseTooLargeError) throw new CruxError(error.message, "response_too_large", false);
      throw error;
    }
    let payload: unknown;
    try { payload = JSON.parse(text); } catch { throw new CruxError("CrUX returned malformed JSON.", "invalid_response", false); }
    return normalizeCruxRecord(payload);
  } catch (error) {
    if (error instanceof CruxError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new CruxError("CrUX request timed out.", "provider_timeout", true);
    throw new CruxError("Could not connect to the CrUX API.", "provider_unavailable", true);
  } finally {
    clearTimeout(timeout);
  }
}

async function queryWithRetry(identifier: string, scope: "url" | "origin", formFactor: "PHONE" | "DESKTOP", key: string) {
  try {
    return await queryCrux(identifier, scope, formFactor, key);
  } catch (error) {
    if (!(error instanceof CruxError) || !error.retryable) throw error;
    const waitMs = Math.min(30_000, Math.max(error.retryAfterMs ?? 1000, 750));
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return queryCrux(identifier, scope, formFactor, key);
  }
}

export async function getCruxFieldData(url: string, formFactor: "PHONE" | "DESKTOP"): Promise<FieldDataResult> {
  const key = getServerEnv().CRUX_API_KEY;
  if (!key) return { status: "not_configured", formFactor, page: null, originFallback: null, errorCode: "provider_not_configured" };

  try {
    const page = await queryWithRetry(url, "url", formFactor, key);
    if (page && Object.keys(page.metrics).length > 0) return { status: "available", formFactor, page, originFallback: null };

    const parsed = new URL(url);
    const originFallback = await queryWithRetry(parsed.origin, "origin", formFactor, key);
    if (originFallback && Object.keys(originFallback.metrics).length > 0) {
      return { status: "available", formFactor, page, originFallback };
    }
    return { status: "no_data", formFactor, page, originFallback: null };
  } catch (error) {
    const cruxError = error instanceof CruxError ? error : new CruxError("CrUX lookup failed.", "provider_unavailable", false);
    return { status: "unavailable", formFactor, page: null, originFallback: null, errorCode: cruxError.code };
  }
}
