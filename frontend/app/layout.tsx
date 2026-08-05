import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
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
    <html lang="en" className={`h-full antialiased ${inter.variable}`}>
      <head>
        {/* Blocking, pre-hydration: applies the stored/OS theme before first
            paint so there is never a flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <PwaProvider />
        <div className="flex min-h-screen flex-col sm:flex-row">
          <Sidebar />
          <MobileNav />
          <main className="flex-1 p-4 sm:p-8 lg:p-10">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
