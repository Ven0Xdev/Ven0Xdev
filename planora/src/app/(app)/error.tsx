"use client";

import { useEffect } from "react";
import { RotateCcw, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const isAccessDenied = error.message.includes("הרשאה");

  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <div className="flex size-12 items-center justify-center rounded-full border border-line bg-surface text-ink-subtle">
        <ShieldAlert className="size-5" aria-hidden />
      </div>

      <h1 className="mt-4 text-lg font-semibold text-ink">
        {isAccessDenied ? "אין לך הרשאה לצפות בתוכן הזה." : "משהו השתבש בטעינת המסך."}
      </h1>
      <p className="mt-2 text-[13px] leading-6 text-ink-muted">
        {isAccessDenied
          ? "אם לדעתך מדובר בטעות, פנה למנהל הארגון שלך."
          : "אפשר לנסות שוב. אם התקלה חוזרת, פנה למנהל המערכת."}
      </p>

      {!isAccessDenied ? (
        <Button variant="primary" className="mt-6" onClick={reset}>
          <RotateCcw />
          נסה שוב
        </Button>
      ) : null}
    </div>
  );
}
