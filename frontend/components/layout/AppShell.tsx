"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { AuthGate } from "@/components/auth/AuthGate";

const PUBLIC_ROUTES = ["/login", "/register"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  if (isPublicRoute) {
    // No nav chrome to show for a page whose whole purpose is "you aren't
    // signed in yet" — and nothing to gate, so AuthGate is skipped too.
    return <main className="flex min-h-screen items-center justify-center p-4">{children}</main>;
  }

  return (
    <div className="flex min-h-screen flex-col sm:flex-row">
      <Sidebar />
      <MobileNav />
      <main className="flex-1 p-4 sm:p-8 lg:p-10">
        <div className="mx-auto w-full max-w-7xl">
          <AuthGate>{children}</AuthGate>
        </div>
      </main>
    </div>
  );
}
