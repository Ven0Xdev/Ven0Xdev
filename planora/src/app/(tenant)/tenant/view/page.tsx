import type { Metadata } from "next";

import { ApartmentView } from "@/components/tenant/apartment-view";
import { requireTenantApartment } from "@/lib/auth/tenant";
import { getTenantConfigurator } from "@/server/queries/tenant";
import { prisma } from "@/lib/db";
import type { DrawingDocument } from "@/lib/drawing/types";

export const metadata: Metadata = { title: "תלת-ממד" };

export default async function TenantViewPage() {
  const { apartment: access } = await requireTenantApartment();
  const data = await getTenantConfigurator(access.id);

  const standardVersion = await prisma.planVersion.findFirst({
    where: { plan: { apartmentId: access.id, kind: "STANDARD" } },
    orderBy: { versionNo: "asc" },
  });

  return (
    <>
      <header className="mb-6">
        <h1 className="text-xl leading-7 font-semibold text-ink">הדירה שלך בתלת-ממד</h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-6 text-ink-muted">
          התצוגה נבנית מתוכנית הדירה שלך ומהחומרים שבחרת. אפשר לסובב, להתקרב, לעבור
          למצב סיור ולראות את הדירה בשעות שונות של היום.
        </p>
      </header>

      <ApartmentView
        apartmentId={access.id}
        mode="3D"
        standardDocument={(standardVersion?.elements as unknown as DrawingDocument | null) ?? null}
        currentDocument={data.document}
        materials={data.materials}
        environment={data.environment}
      />
    </>
  );
}
