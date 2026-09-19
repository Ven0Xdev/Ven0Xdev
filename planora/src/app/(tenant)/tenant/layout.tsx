import { redirect } from "next/navigation";
import { Toaster } from "sonner";

import { TenantShell } from "@/components/tenant/tenant-shell";
import { getCurrentUser } from "@/lib/auth/session";
import { getTenantApartmentId } from "@/lib/auth/tenant";
import { prisma } from "@/lib/db";
import { formatApartment } from "@/lib/i18n/format";

export default async function TenantLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const apartmentId = await getTenantApartmentId(user.id);

  if (!apartmentId) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-lg font-semibold text-ink">לא נמצאה דירה המשויכת אליך.</h1>
          <p className="mt-2 text-[13px] leading-6 text-ink-muted">
            אם רכשת דירה בפרויקט, פנה למנהלת שינויי הדיירים כדי לשייך את הדירה לחשבון
            שלך.
          </p>
        </div>
      </main>
    );
  }

  const apartment = await prisma.apartment.findUniqueOrThrow({
    where: { id: apartmentId },
    select: {
      number: true,
      building: { select: { name: true } },
      project: { select: { name: true } },
    },
  });

  return (
    <TenantShell
      user={{ name: user.name, image: user.image }}
      apartmentLabel={`${formatApartment(apartment.number)} · ${apartment.building.name}`}
      projectName={apartment.project.name}
    >
      {children}
      <Toaster dir="rtl" position="top-center" richColors closeButton />
    </TenantShell>
  );
}
