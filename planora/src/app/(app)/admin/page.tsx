import type { Metadata } from "next";
import Link from "next/link";
import { Building2, FolderKanban, Home, ShieldCheck, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table, TableWrapper } from "@/components/ui/table";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ORGANIZATION_TYPE_LABELS } from "@/lib/i18n/he";
import { formatDate } from "@/lib/i18n/format";
import { CreateOrganizationForm } from "./admin-forms";

export const metadata: Metadata = { title: "ניהול הפלטפורמה" };

export default async function PlatformAdminPage() {
  const admin = await requirePlatformAdmin();

  const [organizations, projectCount, apartmentCount, userCount, bootstrap] = await Promise.all([
    prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        type: true,
        city: true,
        createdAt: true,
        _count: { select: { members: true, projects: true } },
      },
    }),
    prisma.project.count(),
    prisma.apartment.count(),
    prisma.user.count(),
    prisma.adminBootstrap.findUnique({ where: { lock: "singleton" } }),
  ]);

  const stats = [
    { label: "ארגונים", value: organizations.length, icon: Building2 },
    { label: "פרויקטים", value: projectCount, icon: FolderKanban },
    { label: "דירות", value: apartmentCount, icon: Home },
    { label: "משתמשים", value: userCount, icon: Users },
  ];

  return (
    <>
      <PageHeader
        title="ניהול הפלטפורמה"
        description={`OVIAX — אזור מנהל־העל. מחובר כ-${admin.name}.`}
        actions={
          <Link
            href="/admin/users"
            className="inline-flex h-9 items-center rounded-control border border-line-strong bg-surface px-4 text-[13px] text-ink shadow-subtle hover:bg-surface-muted"
          >
            משתמשים ותפקידים
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-3 py-4">
              <span className="flex size-9 items-center justify-center rounded-control bg-surface-sunken text-ink-muted">
                <stat.icon className="size-4" />
              </span>
              <span>
                <span className="block text-lg font-semibold text-ink">{stat.value}</span>
                <span className="block text-[12px] text-ink-muted">{stat.label}</span>
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-ink-muted" />
            אתחול מנהל־העל
          </CardTitle>
        </CardHeader>
        <CardContent className="text-[13px] leading-6 text-ink-muted">
          {bootstrap ? (
            <p>
              בוצע ב-{formatDate(bootstrap.createdAt)} עבור {bootstrap.email}. מנגנון האתחול
              נעול — תפקיד SUPER_ADMIN אינו ניתן להענקה דרך המערכת.
            </p>
          ) : (
            <p>
              לא נרשם אתחול. מנהל־העל הנוכחי נוצר מחוץ למנגנון האתחול החד־פעמי.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>ארגון חדש</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateOrganizationForm />
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>ארגונים</CardTitle>
        </CardHeader>
        <CardContent>
          {organizations.length === 0 ? (
            <EmptyState title="אין ארגונים" description="הוסיפו ארגון ראשון כדי להתחיל." />
          ) : (
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>ארגון</TH>
                    <TH>סוג</TH>
                    <TH>עיר</TH>
                    <TH>משתמשים</TH>
                    <TH>פרויקטים</TH>
                    <TH>נוצר</TH>
                  </TR>
                </THead>
                <TBody>
                  {organizations.map((organization) => (
                    <TR key={organization.id}>
                      <TD>{organization.name}</TD>
                      <TD>
                        <Badge tone="neutral">
                          {ORGANIZATION_TYPE_LABELS[organization.type]}
                        </Badge>
                      </TD>
                      <TD>{organization.city ?? "—"}</TD>
                      <TD>{organization._count.members}</TD>
                      <TD>{organization._count.projects}</TD>
                      <TD>{formatDate(organization.createdAt)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          )}
        </CardContent>
      </Card>
    </>
  );
}
