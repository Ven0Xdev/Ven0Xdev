import type { Metadata } from "next";

import { TenantRequests } from "@/components/tenant/tenant-requests";
import { requireTenantApartment } from "@/lib/auth/tenant";
import { getTenantOverview } from "@/server/queries/tenant";

export const metadata: Metadata = { title: "הבקשות שלי" };

export default async function TenantRequestsPage() {
  const { apartment: access } = await requireTenantApartment();
  const { changeRequests, exceptionRequests } = await getTenantOverview(access.id);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-xl leading-7 font-semibold text-ink">הבקשות שלי</h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-6 text-ink-muted">
          בקשות לשינוי בתוכנית ובקשות לאפשרויות שאינן בקטלוג. כל בקשה נבדקת על ידי
          מנהלת שינויי הדיירים.
        </p>
      </header>

      <TenantRequests
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
