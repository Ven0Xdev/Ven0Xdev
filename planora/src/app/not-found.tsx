import Link from "next/link";
import { FileQuestion } from "lucide-react";

import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo />

      <div className="mt-10 flex size-12 items-center justify-center rounded-full border border-line bg-surface text-ink-subtle">
        <FileQuestion className="size-5" aria-hidden />
      </div>

      <h1 className="mt-4 text-lg font-semibold text-ink">הדף המבוקש לא נמצא.</h1>
      <p className="mt-2 max-w-sm text-[13px] leading-6 text-ink-muted">
        ייתכן שהקישור אינו תקין, או שאין לך גישה לפרויקט או לדירה המבוקשים.
      </p>

      <Link
        href="/"
        className="mt-6 rounded-control bg-brand-600 px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-700"
      >
        חזרה ללוח הבקרה
      </Link>
    </main>
  );
}
