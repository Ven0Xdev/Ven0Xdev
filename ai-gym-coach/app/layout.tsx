import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Gym Coach – המאמן האישי שלך",
  description:
    "ממלאים שאלון קצר ומקבלים תוכנית אימונים ותזונה אישית שנבנית על ידי AI.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
