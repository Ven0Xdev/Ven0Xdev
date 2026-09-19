import type { Metadata } from "next";

import { ApartmentView } from "@/components/tenant/apartment-view";
import { Badge } from "@/components/ui/badge";
import { requireTenantApartment } from "@/lib/auth/tenant";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/i18n/format";
import { PLAN_KIND_LABELS } from "@/lib/i18n/he";
import type { DrawingDocument } from "@/lib/drawing/types";

export const metadata: Metadata = { title: "תוכניות" };

export default async function TenantPlansPage() {
  const { apartment: access } = await requireTenantApartment();

  const versions = await prisma.planVersion.findMany({
    where: { plan: { apartmentId: access.id } },
    include: { plan: { select: { kind: true } } },
    orderBy: { versionNo: "asc" },
  });

  const standard = versions.find((version) => version.plan.kind === "STANDARD");
  const current = versions.filter((version) => version.plan.kind === "MODIFIED").at(-1);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-xl leading-7 font-semibold text-ink">תוכנית הדירה</h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-6 text-ink-muted">
          תוכנית הדירה כפי שהיא מאושרת בפרויקט. אם בוצעו שינויים, אפשר להשוות בין
          התוכנית המקורית לתוכנית העדכנית.
        </p>
      </header>

      <ApartmentView
        mode="2D"
        standardDocument={(standard?.elements as unknown as DrawingDocument | null) ?? null}
        currentDocument={(current?.elements as unknown as DrawingDocument | null) ?? null}
        materials={[]}
      />

      <ul className="mt-5 space-y-2">
        {versions.map((version) => (
          <li
            key={version.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface px-4 py-3"
          >
            <div>
              <p className="text-[13px] font-medium text-ink">{version.title}</p>
              <p className="font-numeric mt-0.5 text-[11px] text-ink-subtle">
                {PLAN_KIND_LABELS[version.plan.kind]} · {formatDate(version.createdAt)}
              </p>
            </div>
            {version.isCurrent ? <Badge tone="brand">התוכנית הנוכחית</Badge> : null}
          </li>
        ))}
      </ul>
    </>
  );
}
