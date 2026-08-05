import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { PwaProvider } from "@/components/pwa/PwaProvider";

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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <PwaProvider />
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 p-6 sm:p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
