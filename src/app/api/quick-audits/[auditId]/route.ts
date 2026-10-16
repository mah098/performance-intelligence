import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/server/db";
import { jsonError, unexpectedError } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ auditId: string }> }) {
  const params = z.object({ auditId: z.string().uuid() }).safeParse(await context.params);
  if (!params.success) return jsonError("not_found", "Quick audit was not found.", 404);
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{30,100})$/)?.[1];
  if (!token) return jsonError("not_found", "Quick audit was not found or has expired.", 404);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  try {
    const result = await getPool().query(
      `SELECT a.id, a.status, a.requested_strategy, a.requested_url, a.completed_at,
              a.lab_categories, a.lab_metrics, a.field_data_status, a.field_data, a.error_message
       FROM guest_audit_access access
       JOIN audit_run a ON a.id = access.audit_run_id
       WHERE access.audit_run_id = $1 AND access.token_sha256 = $2 AND access.expires_at > now()`,
      [params.data.auditId, tokenHash],
    );
    const audit = result.rows[0];
    if (!audit) return jsonError("not_found", "Quick audit was not found or has expired.", 404);
    const fieldData = audit.field_data as {
      status?: string;
      formFactor?: string;
      page?: { scope?: string; collectionPeriod?: { firstDate?: string; lastDate?: string } | null; metrics?: Record<string, { p75?: number; unit?: string }> } | null;
      originFallback?: { scope?: string; collectionPeriod?: { firstDate?: string; lastDate?: string } | null; metrics?: Record<string, { p75?: number; unit?: string }> } | null;
    } | null;
    const pageInp = fieldData?.page?.metrics?.interaction_to_next_paint;
    const originInp = fieldData?.originFallback?.metrics?.interaction_to_next_paint;
    const inpRecord = pageInp ? fieldData?.page : originInp ? fieldData?.originFallback : null;
    const inp = pageInp ?? originInp;
    return NextResponse.json({
      audit: {
        id: audit.id,
        status: audit.status,
        requested_strategy: audit.requested_strategy,
        requested_url: audit.requested_url,
        completed_at: audit.completed_at,
        lab_categories: audit.lab_categories,
        lab_metrics: audit.lab_metrics,
        error_message: audit.error_message,
        field_data: {
          status: fieldData?.status ?? audit.field_data_status,
          formFactor: fieldData?.formFactor ?? null,
          scope: inpRecord?.scope ?? null,
          collectionPeriod: inpRecord?.collectionPeriod ?? null,
          inp: typeof inp?.p75 === "number" ? { p75: inp.p75, unit: inp.unit ?? "ms" } : null,
        },
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return unexpectedError();
  }
}
