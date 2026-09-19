import type { Metadata } from "next";

import { Configurator } from "@/components/tenant/configurator";
import { requireTenantApartment } from "@/lib/auth/tenant";
import { getTenantConfigurator } from "@/server/queries/tenant";

export const metadata: Metadata = { title: "בחירות ושדרוגים" };

export default async function TenantApartmentPage() {
  const { apartment: access } = await requireTenantApartment();
  const data = await getTenantConfigurator(access.id);

  const isLocked = Boolean(data.configuration && data.configuration.status !== "DRAFT");

  return (
    <>
      <header className="mb-6">
        <h1 className="text-xl leading-7 font-semibold text-ink">בחירות ושדרוגים</h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-6 text-ink-muted">
          כל מה שמוצג כאן מאושר לביצוע בפרויקט ומתאים לדירה שלך. אפשר לבחור, לראות איך
          זה נראה, ולשלוח לבדיקה כשמוכנים.
        </p>
      </header>

      <Configurator
        products={data.products}
        categories={data.categories}
        pricing={data.pricing}
        recommendations={data.recommendations}
        materials={data.materials}
        document={data.document}
        isLocked={isLocked}
        isSubmitted={isLocked}
      />
    </>
  );
}
