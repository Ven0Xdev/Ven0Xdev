import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: "Ven0X — OTC AI Research Platform",
  description: "AI-powered probabilistic research and manipulation detection for OTC stocks.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 p-6 sm:p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
