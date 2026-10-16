import { notFound } from "next/navigation";
import { z } from "zod";
import { QuickAuditResult } from "@/app/ui/quick-audit-result";

export const dynamic = "force-dynamic";

export default async function QuickAuditResultPage({ params }: { params: Promise<{ auditId: string }> }) {
  const parsed = z.object({ auditId: z.string().uuid() }).safeParse(await params);
  if (!parsed.success) notFound();
  return <QuickAuditResult auditId={parsed.data.auditId} />;
}
