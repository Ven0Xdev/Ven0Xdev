import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { env, isGoogleConfigured } from "@/lib/env";
import { Logo } from "@/components/brand/logo";
import { USER_ROLE_LABELS } from "@/lib/i18n/he";
import { BlueprintArt } from "./blueprint";
import { DemoSignIn, GoogleSignInButton } from "./sign-in-forms";

export const metadata: Metadata = { title: "כניסה" };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  const demoUsers = env.demoLoginEnabled
    ? await prisma.user.findMany({
        where: { email: { endsWith: "@planora.demo" } },
        include: { memberships: { take: 1, orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const demoOptions = demoUsers
    .filter((user) => user.email)
    .map((user) => ({
      email: user.email as string,
      name: user.name ?? "משתמש",
      role: user.memberships[0]?.role
        ? USER_ROLE_LABELS[user.memberships[0].role]
        : "משתמש",
    }));

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* צד הטופס */}
      <div className="flex flex-col justify-between bg-surface px-6 py-10 sm:px-12 lg:px-16">
        <Logo />

        <div className="mx-auto w-full max-w-sm py-12">
          <h1 className="text-[28px] leading-10 font-semibold tracking-tight text-balance text-ink">
            שינויי דיירים, במקום אחד.
          </h1>
          <p className="mt-3 text-[14px] leading-6 text-ink-muted">
            בדיקת תוכניות, ניהול שינויים, אישורי יועצים ותמחור — בתהליך אחד מסודר.
          </p>

          <div className="mt-9 space-y-3">
            <GoogleSignInButton configured={isGoogleConfigured} />

            {!isGoogleConfigured ? (
              <p className="text-[12px] leading-5 text-ink-subtle">
                כדי להפעיל כניסה עם Google יש להגדיר את משתני הסביבה{" "}
                <code className="font-numeric text-[11px]">AUTH_GOOGLE_ID</code> ו-
                <code className="font-numeric text-[11px]">AUTH_GOOGLE_SECRET</code>.
              </p>
            ) : null}

            {demoOptions.length > 0 ? <DemoSignIn options={demoOptions} /> : null}
          </div>

          <p className="mt-8 flex items-start gap-2 text-[12px] leading-5 text-ink-subtle">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              תוכניות הדירה וקבצי הפרויקט הם מידע עסקי רגיש. הגישה מוגבלת לפי ארגון, פרויקט
              ותפקיד.
            </span>
          </p>
        </div>

        <p className="text-[12px] text-ink-subtle">
          Planora · מערכת לניהול שינויי דיירים בפרויקטי מגורים
        </p>
      </div>

      {/* צד התדמית */}
      <div className="bg-blueprint relative hidden items-center justify-center overflow-hidden border-s border-line bg-brand-50/40 p-16 lg:flex">
        <div className="relative">
          <BlueprintArt />
          <div className="mt-10 max-w-md">
            <p className="text-[13px] leading-6 font-medium text-brand-800">
              תוכנית סטנדרט מול תוכנית שינויים — באותו מסך.
            </p>
            <p className="mt-2 text-[13px] leading-6 text-ink-muted">
              המערכת מסמנת מה נוסף, מה בוטל ומה הוזז, ומכינה את הנתונים לבדיקה המקצועית.
              ההחלטה נשארת אצל מנהלת שינויי הדיירים.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
