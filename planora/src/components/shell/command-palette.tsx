"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, FileSearch, Home, Search, UserCheck } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { globalSearch, type SearchResult } from "@/server/actions/search";
import { cn } from "@/lib/utils";

const KIND_ICONS = {
  PROJECT: Building2,
  APARTMENT: Home,
  CHANGE: FileSearch,
  CONSULTANT_REQUEST: UserCheck,
} as const;

const KIND_LABELS = {
  PROJECT: "פרויקט",
  APARTMENT: "דירה",
  CHANGE: "שינוי",
  CONSULTANT_REQUEST: "בקשת יועץ",
} as const;

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    function onOpenRequest() {
      setIsOpen(true);
    }
    window.addEventListener("planora:open-search", onOpenRequest);
    return () => window.removeEventListener("planora:open-search", onOpenRequest);
  }, []);

  useEffect(() => {
    const term = query.trim();

    const timer = setTimeout(() => {
      if (term.length < 2) {
        setResults([]);
        return;
      }
      startTransition(async () => {
        const found = await globalSearch(term);
        setResults(found);
        setActiveIndex(0);
      });
    }, 180);

    return () => clearTimeout(timer);
  }, [query]);

  const go = useCallback(
    (result: SearchResult) => {
      setIsOpen(false);
      setQuery("");
      router.push(result.href);
    },
    [router],
  );

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const result = results[activeIndex];
      if (result) go(result);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent
        wide
        className="top-[12vh] max-w-xl translate-y-0 overflow-hidden p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">חיפוש</DialogTitle>
        <DialogDescription className="sr-only">
          חיפוש בפרויקטים, דירות ושינויים
        </DialogDescription>

        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="size-4 shrink-0 text-ink-subtle" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="חיפוש בפרויקטים, דירות ושינויים..."
            aria-label="חיפוש"
            className="h-12 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
          />
        </div>

        <div className="max-h-80 overflow-y-auto p-1.5">
          {query.trim().length < 2 ? (
            <p className="px-3 py-8 text-center text-[13px] text-ink-muted">
              הקלד לפחות שני תווים כדי לחפש.
            </p>
          ) : isPending && results.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-ink-muted">מחפש...</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-ink-muted">
              לא נמצאו תוצאות עבור &rdquo;{query}&ldquo;.
            </p>
          ) : (
            <ul>
              {results.map((result, index) => {
                const Icon = KIND_ICONS[result.kind];
                return (
                  <li key={`${result.kind}-${result.id}`}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => go(result)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-right transition-colors",
                        index === activeIndex ? "bg-surface-sunken" : "hover:bg-surface-muted",
                      )}
                    >
                      <Icon className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink">
                          {result.title}
                        </span>
                        <span className="block truncate text-[12px] text-ink-muted">
                          {result.subtitle}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] text-ink-subtle">
                        {KIND_LABELS[result.kind]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** כפתור פתיחת החיפוש בכותרת העליונה */
export function SearchTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("planora:open-search"))}
      className="flex h-9 w-full max-w-md items-center gap-2.5 rounded-control border border-line-strong bg-surface-muted px-3 text-[13px] text-ink-subtle shadow-subtle transition-colors hover:bg-surface"
    >
      <Search className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 text-right">חיפוש בפרויקטים, דירות ושינויים...</span>
      <kbd className="font-numeric hidden rounded border border-line-strong bg-surface px-1.5 py-0.5 text-[10px] text-ink-muted sm:block">
        Ctrl K
      </kbd>
    </button>
  );
}
