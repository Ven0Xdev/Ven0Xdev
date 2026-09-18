import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, FileText } from "lucide-react";

import { ApartmentTable } from "@/components/domain/apartment-table";
import { SeverityBadge } from "@/components/domain/status-badges";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table, TableWrapper } from "@/components/ui/table";
import { UrlTabs, type UrlTab } from "@/components/ui/url-tabs";
import { requireProjectAccess } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate, formatDateTime, UNIT_LABELS } from "@/lib/i18n/format";
import {
  ACTIVITY_KIND_LABELS,
  APARTMENT_STATUS_LABELS,
  CHANGE_CATEGORY_LABELS,
  CHANGE_TYPE_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TABS,
  RULE_EFFECT_LABELS,
  USER_ROLE_LABELS,
} from "@/lib/i18n/he";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<Metadata> {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  });
  return { title: project?.name ?? "פרויקט" };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requireProjectAccess(projectId);

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      organization: { select: { id: true, name: true } },
      tenantChangeManager: { select: { id: true, name: true } },
      buildings: { include: { _count: { select: { apartments: true } } }, orderBy: { name: "asc" } },
      apartmentTypes: {
        include: { _count: { select: { apartments: true } } },
        orderBy: { rooms: "asc" },
      },
      projectRules: { orderBy: { createdAt: "asc" } },
      priceBooks: { include: { items: { orderBy: { code: "asc" } } } },
      files: { include: { uploadedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      activities: {
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 40,
      },
    },
  });

  const [apartments, members, statusGroups, categoryGroups] = await Promise.all([
    prisma.apartment.findMany({
      where: { projectId },
      include: {
        building: true,
        floor: true,
        apartmentType: true,
        assignedManager: { select: { name: true } },
        changeSets: { select: { detectedCount: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: [{ building: { name: "asc" } }, { number: "asc" }],
    }),
    prisma.organizationMember.findMany({
      where: { organizationId: project.organizationId, isActive: true },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.apartment.groupBy({
      by: ["status"],
      where: { projectId },
      _count: { _all: true },
    }),
    prisma.changeItem.groupBy({
      by: ["categoryKey", "type"],
      where: { changeSet: { apartment: { projectId } } },
      _count: { _all: true },
    }),
  ]);

  const rows = apartments.map((apartment) => ({
    id: apartment.id,
    number: apartment.number,
    buildingName: apartment.building.name,
    floorNumber: apartment.floor.number,
    typeName: apartment.apartmentType?.name ?? null,
    buyerName: apartment.buyerName,
    status: apartment.status,
    dueDate: apartment.dueDate,
    projectId: apartment.projectId,
    projectName: project.name,
    changeCount: apartment.changeSets[0]?.detectedCount,
    managerName: apartment.assignedManager?.name ?? null,
  }));

  const priceBook = project.priceBooks[0] ?? null;

  const tabs: UrlTab[] = [
    {
      key: "overview",
      label: PROJECT_TABS.overview,
      content: (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader>
              <CardTitle>התפלגות סטטוס הדירות</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="divide-y divide-line">
                {statusGroups
                  .slice()
                  .sort((a, b) => b._count._all - a._count._all)
                  .map((group) => (
                    <li key={group.status} className="flex items-center justify-between py-2.5">
                      <span className="text-[13px] text-ink-soft">
                        {APARTMENT_STATUS_LABELS[group.status]}
                      </span>
                      <span className="font-numeric text-[13px] font-medium text-ink">
                        {group._count._all}
                      </span>
                    </li>
                  ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>פרטי הפרויקט</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                <Row label="יזם" value={project.developerName ?? "—"} />
                <Row label="קבלן מבצע" value={project.contractorName ?? "—"} />
                <Row label="כתובת" value={[project.address, project.city].filter(Boolean).join(", ") || "—"} />
                <Row label="ארגון מנהל" value={project.organization.name} />
                <Row
                  label="מנהלת שינויי דיירים"
                  value={project.tenantChangeManager?.name ?? "לא שויכה"}
                />
                <Row
                  label="מועד סגירת שינויים"
                  value={project.changeDeadline ? formatDate(project.changeDeadline) : "—"}
                  numeric
                />
              </dl>
            </CardContent>
          </Card>
        </div>
      ),
    },
    {
      key: "buildings",
      label: PROJECT_TABS.buildings,
      badge: project.buildings.length,
      content: (
        <TableWrapper>
          <Table>
            <THead>
              <TR>
                <TH>בניין</TH>
                <TH className="text-left">קומות</TH>
                <TH className="text-left">דירות</TH>
              </TR>
            </THead>
            <TBody>
              {project.buildings.map((building) => (
                <TR key={building.id}>
                  <TD className="font-medium text-ink">{building.name}</TD>
                  <TD className="font-numeric text-left">{building.floors}</TD>
                  <TD className="font-numeric text-left">{building._count.apartments}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrapper>
      ),
    },
    {
      key: "types",
      label: PROJECT_TABS.types,
      badge: project.apartmentTypes.length,
      content: (
        <TableWrapper>
          <Table>
            <THead>
              <TR>
                <TH>טיפוס</TH>
                <TH className="text-left">חדרים</TH>
                <TH className="text-left">שטח</TH>
                <TH className="text-left">מרפסות</TH>
                <TH className="text-left">דירות</TH>
              </TR>
            </THead>
            <TBody>
              {project.apartmentTypes.map((type) => (
                <TR key={type.id}>
                  <TD className="font-medium text-ink">{type.name}</TD>
                  <TD className="font-numeric text-left">{type.rooms}</TD>
                  <TD className="font-numeric text-left">
                    {type.areaSqm ? `${type.areaSqm} מ"ר` : "—"}
                  </TD>
                  <TD className="font-numeric text-left">{type.balconies ?? 0}</TD>
                  <TD className="font-numeric text-left">{type._count.apartments}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrapper>
      ),
    },
    {
      key: "apartments",
      label: PROJECT_TABS.apartments,
      badge: rows.length,
      content: <ApartmentTable rows={rows} />,
    },
    {
      key: "team",
      label: PROJECT_TABS.team,
      badge: members.length,
      content: (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {members.map((member) => (
            <Card key={member.id}>
              <CardContent className="flex items-center gap-3 pt-5">
                <Avatar name={member.user.name} src={member.user.image} size="lg" />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink">{member.user.name}</p>
                  <p className="truncate text-[12px] text-ink-muted">
                    {USER_ROLE_LABELS[member.role]}
                  </p>
                  <p className="font-numeric truncate text-[11px] text-ink-subtle">
                    {member.user.email}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ),
    },
    {
      key: "rules",
      label: PROJECT_TABS.rules,
      badge: project.projectRules.length,
      content:
        project.projectRules.length === 0 ? (
          <EmptyState
            title="לא הוגדרו כללים לפרויקט זה."
            description="כללי פרויקט קובעים מה דורש אישור יועץ ומה חוסם המשך אוטומטי."
          />
        ) : (
          <div className="space-y-3">
            {project.projectRules.map((rule) => (
              <Card key={rule.id}>
                <CardContent className="pt-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-ink">{rule.name}</p>
                      {rule.description ? (
                        <p className="mt-1 text-[12px] leading-5 text-ink-muted">
                          {rule.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone="brand">{RULE_EFFECT_LABELS[rule.effect]}</Badge>
                      <SeverityBadge severity={rule.severity} />
                    </div>
                  </div>
                  <p className="font-numeric mt-3 rounded-control bg-surface-sunken px-3 py-2 text-[11px] leading-5 text-ink-muted">
                    {JSON.stringify(rule.condition)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ),
    },
    {
      key: "priceBook",
      label: PROJECT_TABS.priceBook,
      badge: priceBook?.items.length ?? 0,
      content: priceBook ? (
        <TableWrapper>
          <Table>
            <THead>
              <TR>
                <TH>קוד</TH>
                <TH>סעיף</TH>
                <TH>קטגוריה</TH>
                <TH>סוג שינוי</TH>
                <TH className="text-left">יחידה</TH>
                <TH className="text-left">מחיר</TH>
              </TR>
            </THead>
            <TBody>
              {priceBook.items.map((item) => (
                <TR key={item.id}>
                  <TD className="font-numeric text-ink-muted">{item.code}</TD>
                  <TD className="font-medium text-ink">{item.name}</TD>
                  <TD>{CHANGE_CATEGORY_LABELS[item.categoryKey]}</TD>
                  <TD className="text-ink-muted">
                    {item.changeType ? CHANGE_TYPE_LABELS[item.changeType] : "כל סוג"}
                  </TD>
                  <TD className="text-left">{UNIT_LABELS[item.unit] ?? item.unit}</TD>
                  <TD className="font-numeric text-left font-medium text-ink">
                    {formatCurrency(item.unitPrice)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrapper>
      ) : (
        <EmptyState
          title="לא הוגדר מחירון לפרויקט זה."
          description="ללא מחירון לא ניתן להפיק תמחור אוטומטי מהשינויים המאושרים."
        />
      ),
    },
    {
      key: "files",
      label: PROJECT_TABS.files,
      badge: project.files.length,
      content:
        project.files.length === 0 ? (
          <EmptyState
            icon={<FileText className="size-5" />}
            title="לא הועלו קבצים ברמת הפרויקט."
            description="קבצי תוכניות מופיעים בכרטיס הדירה, תחת לשונית התוכניות."
          />
        ) : (
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH>שם הקובץ</TH>
                  <TH>הועלה על ידי</TH>
                  <TH className="text-left">תאריך</TH>
                </TR>
              </THead>
              <TBody>
                {project.files.map((file) => (
                  <TR key={file.id}>
                    <TD className="font-medium text-ink">{file.originalName}</TD>
                    <TD>{file.uploadedBy?.name ?? "—"}</TD>
                    <TD className="font-numeric text-left">{formatDate(file.createdAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        ),
    },
    {
      key: "reports",
      label: PROJECT_TABS.reports,
      content: (
        <Card>
          <CardHeader>
            <CardTitle>שינויים לפי קטגוריה וסוג</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {categoryGroups.length === 0 ? (
              <p className="py-6 text-[13px] text-ink-muted">טרם זוהו שינויים בפרויקט.</p>
            ) : (
              <TableWrapper className="border-0 shadow-none">
                <Table>
                  <THead>
                    <TR>
                      <TH>קטגוריה</TH>
                      <TH>סוג</TH>
                      <TH className="text-left">כמות</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {categoryGroups
                      .slice()
                      .sort((a, b) => b._count._all - a._count._all)
                      .map((group) => (
                        <TR key={`${group.categoryKey}-${group.type}`}>
                          <TD className="font-medium text-ink">
                            {CHANGE_CATEGORY_LABELS[group.categoryKey]}
                          </TD>
                          <TD>{CHANGE_TYPE_LABELS[group.type]}</TD>
                          <TD className="font-numeric text-left">{group._count._all}</TD>
                        </TR>
                      ))}
                  </TBody>
                </Table>
              </TableWrapper>
            )}
          </CardContent>
        </Card>
      ),
    },
    {
      key: "history",
      label: PROJECT_TABS.history,
      content:
        project.activities.length === 0 ? (
          <EmptyState title="טרם נרשמה פעילות בפרויקט." />
        ) : (
          <Card>
            <CardContent className="pt-5">
              <ol className="space-y-3">
                {project.activities.map((activity) => (
                  <li key={activity.id} className="flex items-start gap-2.5">
                    <Avatar name={activity.user?.name ?? "מערכת"} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-5 text-ink-soft">{activity.message}</p>
                      <p className="font-numeric mt-0.5 text-[11px] text-ink-subtle">
                        {ACTIVITY_KIND_LABELS[activity.kind]} · {formatDateTime(activity.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ),
    },
  ];

  return (
    <>
      <nav aria-label="מיקום" className="mb-3 flex items-center gap-1 text-[12px] text-ink-muted">
        <Link href="/projects" className="hover:text-ink">
          פרויקטים
        </Link>
        <ChevronLeft className="size-3.5" aria-hidden />
        <span className="text-ink-soft">{project.name}</span>
      </nav>

      <PageHeader
        title={project.name}
        description={project.description ?? undefined}
        actions={<Badge tone="brand">{PROJECT_STATUS_LABELS[project.status]}</Badge>}
      />

      <UrlTabs tabs={tabs} />
    </>
  );
}

function Row({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[12px] text-ink-muted">{label}</dt>
      <dd
        className={`min-w-0 truncate text-[13px] font-medium text-ink ${numeric ? "font-numeric" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
