"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApartmentStatusBadge } from "@/components/domain/status-badges";
import { formatApartment, formatDate, formatFloor } from "@/lib/i18n/format";
import type { ApartmentHeaderInfo } from "./types";

export interface WorkspaceTab {
  key: string;
  label: string;
  content: React.ReactNode;
  badge?: number;
}

export function ApartmentWorkspace({
  header,
  tabs,
}: {
  header: ApartmentHeaderInfo;
  tabs: WorkspaceTab[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const activeTab = tabs.some((tab) => tab.key === requested) ? requested! : tabs[0].key;

  function onTabChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    params.delete("change");
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <>
      <nav aria-label="מיקום" className="mb-3 flex items-center gap-1 text-[12px] text-ink-muted">
        <Link href="/projects" className="hover:text-ink">
          פרויקטים
        </Link>
        <ChevronLeft className="size-3.5" aria-hidden />
        <Link href={`/projects/${header.projectId}`} className="hover:text-ink">
          {header.projectName}
        </Link>
        <ChevronLeft className="size-3.5" aria-hidden />
        <span className="text-ink-soft">{formatApartment(header.number)}</span>
      </nav>

      <header className="mb-5 rounded-card border border-line bg-surface px-5 py-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl leading-7 font-semibold text-ink">
                {formatApartment(header.number)}
              </h1>
              <ApartmentStatusBadge status={header.status} />
            </div>
            <p className="mt-1 text-[13px] text-ink-muted">
              {header.buildingName} · {formatFloor(header.floorNumber)}
              {header.apartmentTypeName ? ` · ${header.apartmentTypeName}` : ""}
              {header.buyerName ? ` · ${header.buyerName}` : ""}
            </p>
          </div>

          <dl className="flex flex-wrap gap-x-7 gap-y-2">
            <HeaderField label="גרסה נוכחית" value={header.currentVersionLabel} numeric />
            <HeaderField label="מנהלת שינויי דיירים" value={header.managerName ?? "—"} />
            <HeaderField label="מתאמת" value={header.coordinatorName ?? "—"} />
            <HeaderField
              label="תאריך יעד"
              value={header.dueDate ? formatDate(header.dueDate) : "—"}
              numeric
            />
          </dl>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList className="overflow-x-auto">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key}>
              {tab.label}
              {tab.badge && tab.badge > 0 ? (
                <span className="font-numeric ms-1.5 rounded-pill bg-surface-sunken px-1.5 py-0.5 text-[11px] leading-4 text-ink-muted">
                  {tab.badge}
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((tab) => (
          <TabsContent key={tab.key} value={tab.key}>
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}

function HeaderField({
  label,
  value,
  numeric,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] text-ink-subtle">{label}</dt>
      <dd className={`mt-0.5 text-[13px] font-medium text-ink ${numeric ? "font-numeric" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
