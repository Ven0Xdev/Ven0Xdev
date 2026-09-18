import { cn } from "@/lib/utils";

const LEGEND_ITEMS = [
  { label: "נוסף", color: "var(--color-change-added)" },
  { label: "בוטל", color: "var(--color-change-removed)" },
  { label: "הוזז או שונה", color: "var(--color-change-moved)" },
  { label: "זיהוי לא ודאי", color: "var(--color-change-unknown)" },
];

export function CompareLegend({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {LEGEND_ITEMS.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-[12px] text-ink-muted">
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: item.color }}
            aria-hidden
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
