import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table, TableWrapper } from "@/components/ui/table";
import { effectiveRole, requirePlatformAdmin } from "@/lib/auth/session";
import { assignableRolesFor } from "@/lib/auth/role-assignment";
import { prisma } from "@/lib/db";
import { USER_ROLE_LABELS } from "@/lib/i18n/he";
import { formatDate } from "@/lib/i18n/format";
import { ChangeRoleForm, CreateMemberForm } from "../admin-forms";

export const metadata: Metadata = { title: "משתמשים ותפקידים" };

export default async function PlatformUsersPage() {
  const admin = await requirePlatformAdmin();
  const assignableRoles = assignableRolesFor(effectiveRole(admin), admin.isSuperAdmin);

  const [organizations, members, superAdmins] = await Promise.all([
    prisma.organization.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.organizationMember.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        role: true,
        isActive: true,
        createdAt: true,
        organization: { select: { name: true } },
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.user.findMany({
      where: { isSuperAdmin: true },
      select: { id: true, name: true, email: true, createdAt: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="משתמשים ותפקידים"
        description="תפקיד SUPER_ADMIN אינו מופיע כאן ואינו ניתן להענקה — הוא נוצר רק באתחול החד־פעמי."
        breadcrumb={
          <Link href="/admin" className="text-[13px] text-brand-600 hover:underline">
            ניהול הפלטפורמה
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>מנהלי־על</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-[13px] text-ink-muted">
            {superAdmins.map((user) => (
              <li key={user.id}>
                {user.name ?? "—"} · {user.email} · נוצר {formatDate(user.createdAt)}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>משתמש חדש</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateMemberForm organizations={organizations} assignableRoles={assignableRoles} />
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>חברי ארגונים</CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <EmptyState title="אין משתמשים" description="הוסיפו משתמש ראשון לארגון." />
          ) : (
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>שם</TH>
                    <TH>דואר אלקטרוני</TH>
                    <TH>ארגון</TH>
                    <TH>תפקיד</TH>
                    <TH>שינוי תפקיד</TH>
                  </TR>
                </THead>
                <TBody>
                  {members.map((member) => (
                    <TR key={member.id}>
                      <TD>{member.user.name ?? "—"}</TD>
                      <TD>{member.user.email ?? "—"}</TD>
                      <TD>{member.organization.name}</TD>
                      <TD>
                        <Badge tone={member.isActive ? "neutral" : "warning"}>
                          {USER_ROLE_LABELS[member.role]}
                        </Badge>
                      </TD>
                      <TD>
                        <ChangeRoleForm
                          membershipId={member.id}
                          currentRole={member.role}
                          assignableRoles={assignableRoles}
                        />
                      </TD>
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
