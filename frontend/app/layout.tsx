import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { PwaProvider } from "@/components/pwa/PwaProvider";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nexora — AI Market Research Platform",
  description: "AI-powered research and trading intelligence across US large-caps, ETFs, indices, and commodities.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { title: "Nexora", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0bb981",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`h-full antialiased ${inter.variable}`} suppressHydrationWarning>
      {/* suppressHydrationWarning is scoped to this element's own attributes
          only (not descendants) — it exists for exactly this case: the
          blocking script below legitimately sets data-theme on the client
          before React hydrates, since the server has no theme signal at
          all. Without it, React logs a false-alarm mismatch warning on
          every single page load. */}
      <head>
        {/* Blocking, pre-hydration: applies the stored/OS theme before first
            paint so there is never a flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <PwaProvider />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
