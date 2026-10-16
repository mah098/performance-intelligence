import { getServerEnv } from "@/server/env";
import { readBoundedResponseText, ResponseTooLargeError } from "@/server/bounded-response";

const PSI_ENDPOINT = "https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed";
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"] as const;
const MAX_RESPONSE_BYTES = 12 * 1024 * 1024;

function parseRetryAfter(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : undefined;
}

export type LabMetric = { value: number; unit: string; auditId: string };
export type AuditEvidence = {
  id: string;
  title: string;
  description: string;
  score: number | null;
  scoreDisplayMode: string;
  numericValue?: number;
  numericUnit?: string;
  details?: unknown;
};

export type PageSpeedResult = {
  requestedUrl: string;
  finalUrl: string;
  fetchTime: string;
  lighthouseVersion: string;
  psiVersion: { major?: string; minor?: string } | null;
  categories: Record<string, number | null>;
  metrics: Record<string, LabMetric>;
  evidence: AuditEvidence[];
  warnings: string[];
};

export class PageSpeedError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "PageSpeedError";
  }
}

export function normalizePageSpeedResponse(payload: unknown): PageSpeedResult {
  if (!payload || typeof payload !== "object") throw new PageSpeedError("Google returned an invalid audit response.", "invalid_response", false);
  const root = payload as Record<string, unknown>;
  const lighthouse = root.lighthouseResult as Record<string, unknown> | undefined;
  if (!lighthouse || typeof lighthouse !== "object") throw new PageSpeedError("Google did not return Lighthouse results.", "missing_lighthouse", false);

  const rawCategories = (lighthouse.categories ?? {}) as Record<string, unknown>;
  const categories: Record<string, number | null> = {};
  for (const [key, rawKey] of [["performance", "performance"], ["accessibility", "accessibility"], ["best-practices", "best-practices"], ["seo", "seo"]]) {
    const raw = rawCategories[rawKey] as { score?: unknown } | undefined;
    categories[key] = typeof raw?.score === "number" && Number.isFinite(raw.score) ? Math.round(raw.score * 100) : null;
  }

  const rawAudits = (lighthouse.audits ?? {}) as Record<string, unknown>;
  const metrics: Record<string, LabMetric> = {};
  const metricIds = ["largest-contentful-paint", "first-contentful-paint", "cumulative-layout-shift", "server-response-time"];
  for (const auditId of metricIds) {
    const audit = rawAudits[auditId] as { numericValue?: unknown; numericUnit?: unknown } | undefined;
    if (typeof audit?.numericValue !== "number" || !Number.isFinite(audit.numericValue)) continue;
    const metricName = auditId === "server-response-time" ? "time-to-first-byte" : auditId;
    const unit = typeof audit.numericUnit === "string" ? audit.numericUnit : auditId === "cumulative-layout-shift" ? "unitless" : "ms";
    metrics[metricName] = { value: audit.numericValue, unit, auditId };
  }

  const evidence: AuditEvidence[] = [];
  for (const [id, unknownAudit] of Object.entries(rawAudits)) {
    if (!unknownAudit || typeof unknownAudit !== "object") continue;
    const audit = unknownAudit as Record<string, unknown>;
    const score = typeof audit.score === "number" && Number.isFinite(audit.score) ? audit.score : null;
    const mode = typeof audit.scoreDisplayMode === "string" ? audit.scoreDisplayMode : "unknown";
    if (!(score !== null && score < 0.9) && !["error", "informative"].includes(mode)) continue;
    const item: AuditEvidence = {
      id,
      title: typeof audit.title === "string" ? audit.title.slice(0, 240) : id,
      description: typeof audit.description === "string" ? audit.description.slice(0, 1400) : "",
      score,
      scoreDisplayMode: mode,
    };
    if (typeof audit.numericValue === "number" && Number.isFinite(audit.numericValue)) item.numericValue = audit.numericValue;
    if (typeof audit.numericUnit === "string") item.numericUnit = audit.numericUnit.slice(0, 32);
    if (audit.details && typeof audit.details === "object") {
      try {
        item.details = JSON.parse(JSON.stringify(audit.details).slice(0, 3000));
      } catch {
        // Optional details are omitted if truncation would make them invalid JSON.
      }
    }
    evidence.push(item);
    if (evidence.length >= 40) break;
  }

  const warnings = Array.isArray(lighthouse.runWarnings)
    ? lighthouse.runWarnings.filter((warning): warning is string => typeof warning === "string").slice(0, 12).map((warning) => warning.slice(0, 500))
    : [];
  const settings = root.version as { major?: unknown; minor?: unknown } | undefined;
  return {
    requestedUrl: typeof lighthouse.requestedUrl === "string" ? lighthouse.requestedUrl : typeof root.id === "string" ? root.id : "",
    finalUrl: typeof lighthouse.finalUrl === "string" ? lighthouse.finalUrl : typeof root.id === "string" ? root.id : "",
    fetchTime: typeof lighthouse.fetchTime === "string" ? lighthouse.fetchTime : new Date().toISOString(),
    lighthouseVersion: typeof lighthouse.lighthouseVersion === "string" ? lighthouse.lighthouseVersion : "unknown",
    psiVersion: settings ? {
      major: typeof settings.major === "string" ? settings.major : undefined,
      minor: typeof settings.minor === "string" ? settings.minor : undefined,
    } : null,
    categories,
    metrics,
    evidence,
    warnings,
  };
}

export async function runPageSpeed(url: string, strategy: "mobile" | "desktop"): Promise<PageSpeedResult> {
  const key = getServerEnv().PAGESPEED_API_KEY;
  if (!key) throw new PageSpeedError("PageSpeed API is not configured. Set PAGESPEED_API_KEY on the server.", "provider_not_configured", false);

  const endpoint = new URL(PSI_ENDPOINT);
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", strategy);
  endpoint.searchParams.set("key", key);
  for (const category of CATEGORIES) endpoint.searchParams.append("category", category);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 125_000);
  try {
    const response = await fetch(endpoint, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      const retryAfterMs = parseRetryAfter(response);
      throw new PageSpeedError(
        response.status === 429 ? "Google PageSpeed quota was reached; the audit will retry later." : `Google PageSpeed returned HTTP ${response.status}.`,
        response.status === 429 ? "provider_rate_limited" : `provider_http_${response.status}`,
        retryable,
        retryAfterMs,
      );
    }
    let text: string;
    try {
      text = await readBoundedResponseText(response, MAX_RESPONSE_BYTES);
    } catch (error) {
      if (error instanceof ResponseTooLargeError) throw new PageSpeedError(error.message, "response_too_large", false);
      throw error;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new PageSpeedError("Google returned malformed audit JSON.", "invalid_response", false);
    }
    return normalizePageSpeedResponse(payload);
  } catch (error) {
    if (error instanceof PageSpeedError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new PageSpeedError("The PageSpeed audit timed out.", "provider_timeout", true);
    throw new PageSpeedError("Could not connect to Google PageSpeed.", "provider_unavailable", true);
  } finally {
    clearTimeout(timeout);
  }
}
