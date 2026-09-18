import type { Metadata, Viewport } from "next";
import { Heebo, Inter } from "next/font/google";

import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

/** Inter משמש למספרים, מחירים, קודים וגרסאות */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Planora — שינויי דיירים, במקום אחד",
    template: "%s · Planora",
  },
  description:
    "בדיקת תוכניות, ניהול שינויי דיירים, אישורי יועצים ותמחור — בתהליך אחד מסודר.",
};

export const viewport: Viewport = {
  themeColor: "#1f4479",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} ${inter.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
