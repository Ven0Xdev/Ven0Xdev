import type { Metadata } from "next";

import { TenantChanges } from "@/components/tenant/tenant-changes";
import { requireTenantApartment } from "@/lib/auth/tenant";
import { prisma } from "@/lib/db";
import { getTenantOverview } from "@/server/queries/tenant";

export const metadata: Metadata = { title: "השינויים שלי" };

/**
 * השינויים שהדייר רואה.
 *
 * במכוון אין כאן רמת ודאות בזיהוי, כללי מערכת, קודי יועץ פנימיים או פרטי
 * ביקורת — אלה נתונים מקצועיים ששייכים לממשק המקצועי בלבד.
 */
export default async function TenantChangesPage() {
  const { apartment: access } = await requireTenantApartment();
  const { changeRequests, exceptionRequests } = await getTenantOverview(access.id);

  const changeSet = await prisma.changeSet.findFirst({
    where: { apartmentId: access.id },
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        orderBy: { code: "asc" },
        include: { pricingLines: { select: { quantity: true, unitPrice: true } } },
      },
    },
  });

  const planChanges = (changeSet?.items ?? [])
    // שינוי שסומן כזיהוי שגוי אינו שינוי — הוא לא מוצג לדייר
    .filter((item) => item.status !== "DISMISSED")
    .map((item) => ({
      id: item.id,
      description: item.description,
      categoryKey: item.categoryKey,
      roomLabel: item.roomLabel,
      status: item.status,
      price: item.pricingLines.reduce(
        (sum, line) => sum + line.quantity * line.unitPrice,
        0,
      ),
      notes: item.notes,
    }));

  return (
    <>
      <header className="mb-6">
        <h1 className="text-xl leading-7 font-semibold text-ink">השינויים שלי</h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-6 text-ink-muted">
          כל השינויים בדירה שלך: מה ביקשת, מה אושר, מה ממתין לבדיקה מקצועית ומה תומחר.
        </p>
      </header>

      <TenantChanges
        planChanges={planChanges}
        changeRequests={changeRequests.map((request) => ({
          id: request.id,
          code: request.code,
          title: request.title,
          description: request.description,
          category: request.category,
          status: request.status,
          createdAt: request.createdAt,
          decisionNotes: request.decisionNotes,
          estimatedPrice: request.estimatedPrice,
        }))}
        exceptionRequests={exceptionRequests.map((request) => ({
          id: request.id,
          code: request.code,
          title: request.title,
          description: request.description,
          category: request.category,
          status: request.status,
          createdAt: request.createdAt,
          decisionNotes: request.decisionNotes,
        }))}
      />
    </>
  );
}
