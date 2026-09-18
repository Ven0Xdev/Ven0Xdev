"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

export interface UrlTab {
  key: string;
  label: string;
  content: React.ReactNode;
  badge?: number;
}

/** לשוניות שמסונכרנות עם כתובת הדף — כדי שניתן יהיה לשתף קישור ישיר */
export function UrlTabs({ tabs, paramName = "tab" }: { tabs: UrlTab[]; paramName?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get(paramName);
  const active = tabs.some((tab) => tab.key === requested) ? requested! : tabs[0].key;

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramName, value);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <Tabs value={active} onValueChange={onChange}>
      <TabsList className="overflow-x-auto">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.key}
            value={tab.key}
            aria-label={tab.badge && tab.badge > 0 ? `${tab.label}, ${tab.badge}` : undefined}
          >
            {tab.label}
            {tab.badge && tab.badge > 0 ? (
              <span
                aria-hidden
                className="font-numeric ms-1.5 rounded-pill bg-surface-sunken px-1.5 py-0.5 text-[11px] leading-4 text-ink-muted"
              >
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
  );
}
