"use client";

import { useState, useTransition } from "react";
import { ChevronLeft, LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { signInWithDemoUser, signInWithGoogle } from "./actions";

export function GoogleSignInButton({ configured }: { configured: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      size="lg"
      className="w-full justify-center"
      disabled={isPending || !configured}
      title={configured ? undefined : "כניסה עם Google אינה מוגדרת בסביבה זו"}
      onClick={() => startTransition(() => void signInWithGoogle())}
    >
      <GoogleGlyph />
      {isPending ? "מתחבר..." : "המשך עם Google"}
    </Button>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.92l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.28a12 12 0 0 0 0 10.74l4.01-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.63l4.01 3.09C6.23 6.88 8.88 4.77 12 4.77Z"
      />
    </svg>
  );
}

interface DemoOption {
  email: string;
  name: string;
  role: string;
}

export function DemoSignIn({ options }: { options: DemoOption[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  function handleSelect(email: string) {
    const formData = new FormData();
    formData.set("email", email);
    setPendingEmail(email);
    startTransition(() => void signInWithDemoUser(formData));
  }

  return (
    <div className="rounded-card border border-line bg-surface-muted/70">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 rounded-card px-4 py-3 text-right transition-colors hover:bg-surface-sunken/60"
      >
        <span>
          <span className="block text-[13px] font-medium text-ink">כניסה לסביבת הדגמה</span>
          <span className="mt-0.5 block text-[12px] text-ink-muted">
            בחירת משתמש מנתוני ההדגמה, ללא Google
          </span>
        </span>
        <ChevronLeft
          className={cn(
            "size-4 shrink-0 text-ink-subtle transition-transform",
            isOpen && "-rotate-90",
          )}
          aria-hidden
        />
      </button>

      {isOpen ? (
        <ul className="animate-in-up border-t border-line p-1.5">
          {options.map((option) => (
            <li key={option.email}>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleSelect(option.email)}
                className="flex w-full items-center justify-between gap-3 rounded-control px-3 py-2.5 text-right transition-colors hover:bg-surface disabled:opacity-60"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink">
                    {option.name}
                  </span>
                  <span className="block truncate text-[12px] text-ink-muted">{option.role}</span>
                </span>
                {isPending && pendingEmail === option.email ? (
                  <span className="text-[12px] text-ink-subtle">מתחבר...</span>
                ) : (
                  <LogIn className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
