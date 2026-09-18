"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search, X } from "lucide-react";

import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface FilterOption {
  value: string;
  label: string;
}

/** סרגל סינון שמסנכרן את הבחירה עם כתובת הדף */
export function FilterBar({
  filters,
  searchPlaceholder = "חיפוש...",
  showSearch = true,
}: {
  filters: { name: string; label: string; options: FilterOption[] }[];
  searchPlaceholder?: string;
  showSearch?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const appliedQuery = searchParams.get("q") ?? "";
  // הערך מאותחל מחדש בכל שינוי בכתובת, ולכן אין צורך בסנכרון ב-effect
  const [query, setQuery] = useState(appliedQuery);
  const [syncedTo, setSyncedTo] = useState(appliedQuery);

  if (syncedTo !== appliedQuery) {
    setSyncedTo(appliedQuery);
    setQuery(appliedQuery);
  }

  function update(name: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(name, value);
    else params.delete(name);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  const hasFilters = filters.some((filter) => searchParams.get(filter.name)) || query.length > 0;

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      {showSearch ? (
        <form
          className="relative min-w-56 flex-1 sm:max-w-xs"
          onSubmit={(event) => {
            event.preventDefault();
            update("q", query.trim());
          }}
        >
          <Search
            className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onBlur={() => update("q", query.trim())}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="pe-9"
          />
        </form>
      ) : null}

      {filters.map((filter) => (
        <label key={filter.name} className="flex min-w-44 flex-col gap-1">
          <span className="text-[11px] font-medium text-ink-muted">{filter.label}</span>
          <Select
            value={searchParams.get(filter.name) ?? ""}
            onChange={(event) => update(filter.name, event.target.value)}
          >
            <option value="">הכל</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
      ))}

      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQuery("");
            router.replace("?", { scroll: false });
          }}
        >
          <X />
          ניקוי סינון
        </Button>
      ) : null}
    </div>
  );
}
