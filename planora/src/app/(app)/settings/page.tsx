import type { Metadata } from "next";
import Link from "next/link";
import { Check, Minus } from "lucide-react";

import { SeverityBadge } from "@/components/domain/status-badges";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, PageHeader } from "@/components/ui/misc";
import { UrlTabs, type UrlTab } from "@/components/ui/url-tabs";
import { TBody, TD, TH, THead, TR, Table, TableWrapper } from "@/components/ui/table";
import { requireUser, primaryRole } from "@/lib/auth/session";
import { ROLE_CAPABILITIES } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { isGoogleConfigured } from "@/lib/env";
import {
  NAV_LABELS,
  ORGANIZATION_TYPE_LABELS,
  RULE_EFFECT_LABELS,
  USER_ROLE_LABELS,
} from "@/lib/i18n/he";
import { formatDate } from "@/lib/i18n/format";

export const metadata: Metadata = { title: NAV_LABELS.settings };

const CAPABILITY_LABELS: Record<string, string> = {
  "organization:manage": "ניהול הארגון",
  "project:manage": "ניהול פרויקטים",
  "project:view": "צפייה בפרויקטים",
  "apartment:manage": "ניהול דירות",
  "plan:upload": "העלאת תוכניות",
  "review:perform": "ביצוע בדיקה מקצועית",
  "change:decide": "הכרעה בשינויים",
  "change:comment": "הוספת הערות",
  "change:sendToConsultant": "שליחה ליועץ",
  "consultant:respond": "מענה כיועץ",
  "pricing:manage": "ניהול תמחור",
  "pricing:approve": "אישור תמחור",
  "payment:record": "רישום תשלום",
  "execution:release": "שחרור לביצוע",
  "rules:manage": "ניהול כללים",
  "priceBook:manage": "ניהול מחירון",
  "learning:view": "צפייה במרכז הלמידה",
};

export default async function SettingsPage() {
  const user = await requireUser();
  const role = primaryRole(user);
  const organizationId = user.primaryMembership?.organizationId;

  const [members, systemRules, organization] = await Promise.all([
    organizationId
      ? prisma.organizationMember.findMany({
          where: { organizationId, isActive: true },
          include: { user: { select: { name: true, email: true, image: true } } },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    organizationId
      ? prisma.rule.findMany({ where: { organizationId }, orderBy: { key: "asc" } })
      : Promise.resolve([]),
    organizationId
      ? prisma.organization.findUnique({ where: { id: organizationId } })
      : Promise.resolve(null),
  ]);

  const capabilities = role ? ROLE_CAPABILITIES[role] : [];

  const tabs: UrlTab[] = [
    {
      key: "profile",
      label: "הפרופיל שלי",
      content: (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>פרטי המשתמש</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Avatar name={user.name} src={user.image} size="lg" />
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-ink">{user.name}</p>
                  <p className="font-numeric text-[12px] text-ink-muted">{user.email}</p>
                </div>
              </div>

              <dl className="mt-5 space-y-3 border-t border-line pt-4">
                <Row label="תפקיד" value={role ? USER_ROLE_LABELS[role] : "—"} />
                <Row
                  label="ארגון"
                  value={user.primaryMembership?.organization.name ?? "—"}
                />
                <Row
                  label="שיוך לארגונים"
                  value={`${user.memberships.length} ארגונים`}
                  numeric
                />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>ההרשאות שלי</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 sm:grid-cols-2">
                {Object.entries(CAPABILITY_LABELS).map(([key, label]) => {
                  const allowed = capabilities.includes(key as never);
                  return (
                    <li key={key} className="flex items-center gap-2 text-[12px]">
                      {allowed ? (
                        <Check className="size-3.5 shrink-0 text-success-600" aria-hidden />
                      ) : (
                        <Minus className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />
                      )}
                      <span className={allowed ? "text-ink-soft" : "text-ink-subtle"}>{label}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 border-t border-line pt-3 text-[12px] leading-5 text-ink-muted">
                ההרשאות נאכפות בצד השרת בכל פעולה. שינוי הרשאות נעשה על ידי מנהל הארגון.
              </p>
            </CardContent>
          </Card>
        </div>
      ),
    },
    {
      key: "organizations",
      label: "ארגונים",
      badge: user.memberships.length,
      content: (
        <div className="space-y-5">
          {organization ? (
            <Card>
              <CardHeader>
                <CardTitle>{organization.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <Row label="סוג ארגון" value={ORGANIZATION_TYPE_LABELS[organization.type]} />
                  <Row label="שם משפטי" value={organization.legalName ?? "—"} />
                  <Row
                    label="כתובת"
                    value={[organization.address, organization.city].filter(Boolean).join(", ") || "—"}
                  />
                  <Row label="טלפון" value={organization.phone ?? "—"} numeric />
                  <Row label="נוצר" value={formatDate(organization.createdAt)} numeric />
                </dl>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>השיוכים שלי</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="divide-y divide-line">
                {user.memberships.map((membership) => (
                  <li key={membership.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-ink">
                        {membership.organization.name}
                      </p>
                      <p className="text-[12px] text-ink-muted">
                        {ORGANIZATION_TYPE_LABELS[membership.organization.type]}
                      </p>
                    </div>
                    <Badge tone="brand">{USER_ROLE_LABELS[membership.role]}</Badge>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-line pt-3 text-[12px] leading-5 text-ink-muted">
                חברת ניהול שינויי דיירים יכולה להיות מחוברת למספר יזמים וקבלנים. ההרשאה נקבעת
                לפי ארגון, פרויקט ותפקיד.
              </p>
            </CardContent>
          </Card>
        </div>
      ),
    },
    {
      key: "team",
      label: "צוות",
      badge: members.length,
      content: (
        <TableWrapper>
          <Table>
            <THead>
              <TR>
                <TH>שם</TH>
                <TH>תפקיד</TH>
                <TH>תיאור תפקיד</TH>
                <TH className="text-left">דואר אלקטרוני</TH>
              </TR>
            </THead>
            <TBody>
              {members.map((member) => (
                <TR key={member.id}>
                  <TD>
                    <span className="flex items-center gap-2.5">
                      <Avatar name={member.user.name} src={member.user.image} size="sm" />
                      <span className="font-medium text-ink">{member.user.name}</span>
                    </span>
                  </TD>
                  <TD>
                    <Badge tone="neutral">{USER_ROLE_LABELS[member.role]}</Badge>
                  </TD>
                  <TD className="text-ink-muted">{member.jobTitle ?? "—"}</TD>
                  <TD className="font-numeric text-left text-ink-muted">{member.user.email}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrapper>
      ),
    },
    {
      key: "rules",
      label: "כללי מערכת",
      badge: systemRules.length,
      content: (
        <div className="space-y-3">
          <p className="text-[13px] leading-6 text-ink-muted">
            כללי המערכת חלים על כל הפרויקטים בארגון. כללים ייעודיים לפרויקט מוגדרים בעמוד
            הפרויקט, תחת &rdquo;כללי הפרויקט&ldquo;.
          </p>
          {systemRules.map((rule) => (
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
              </CardContent>
            </Card>
          ))}
        </div>
      ),
    },
    {
      key: "integrations",
      label: "חיבורים",
      content: (
        <div className="grid gap-4 md:grid-cols-2">
          <IntegrationCard
            name="Google Workspace"
            description="כניסה מאובטחת עם חשבון Google הארגוני."
            connected={isGoogleConfigured}
            connectedLabel="מוגדר"
            pendingLabel="לא מוגדר בסביבה זו"
          />
          <IntegrationCard
            name="Google Drive"
            description="סנכרון קבצי תוכניות מתיקיית הפרויקט."
            connected={false}
            connectedLabel="מחובר"
            pendingLabel="לא מחובר"
          />
          <IntegrationCard
            name="Autodesk Platform Services"
            description="קריאת קבצי DWG ו-Revit והפקת מודל אלמנטים מהקובץ."
            connected={false}
            connectedLabel="מחובר"
            pendingLabel="לא מחובר"
          />
          <IntegrationCard
            name="אחסון קבצים מרוחק"
            description="שמירת תוכניות באחסון ייעודי עם קישורי גישה חתומים."
            connected={false}
            connectedLabel="מחובר"
            pendingLabel="לא מחובר"
          />
        </div>
      ),
    },
    {
      key: "privacy",
      label: "פרטיות ואבטחה",
      content: (
        <Card>
          <CardHeader>
            <CardTitle>מדיניות המידע במערכת</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-[13px] leading-6 text-ink-soft">
              <li>
                תוכניות דירה וקבצי פרויקט הם מידע עסקי רגיש. הגישה אליהם מוגבלת לפי ארגון,
                פרויקט ותפקיד, והבדיקה נעשית בצד השרת בכל בקשה.
              </li>
              <li>ארגון אחד אינו רואה מידע של ארגון אחר, גם לא דרך חיפוש או קישור ישיר.</li>
              <li>
                תוכניות אינן נשלחות לשירות חיצוני כלשהו ללא הגדרה מפורשת של הארגון.
              </li>
              <li>
                כל החלטה מקצועית נשמרת ביומן מלא עם שם בעל התפקיד, התפקיד, התאריך והגרסה
                שעליה התקבלה ההחלטה.
              </li>
              <li>גרסה מאושרת של תוכנית לעולם אינה נדרסת — כל שינוי יוצר גרסה חדשה.</li>
            </ul>

            <p className="mt-5 border-t border-line pt-4 text-[12px] text-ink-muted">
              לפרטים על כללי הבדיקה האוטומטית ראו{" "}
              <Link href="/learning-center" className="text-brand-600 hover:text-brand-700">
                מרכז הלמידה
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={NAV_LABELS.settings}
        description="פרופיל, ארגונים, הרשאות, כללי מערכת וחיבורים."
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

function IntegrationCard({
  name,
  description,
  connected,
  connectedLabel,
  pendingLabel,
}: {
  name: string;
  description: string;
  connected: boolean;
  connectedLabel: string;
  pendingLabel: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-ink">{name}</p>
            <p className="mt-1 text-[12px] leading-5 text-ink-muted">{description}</p>
          </div>
          <Badge tone={connected ? "success" : "neutral"}>
            {connected ? connectedLabel : pendingLabel}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
