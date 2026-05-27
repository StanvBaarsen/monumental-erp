import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// Display serif — PP Editorial New
const editorial = localFont({
  variable: "--font-editorial",
  display: "swap",
  src: [
    { path: "../fonts/PPEditorialNew-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/PPEditorialNew-Italic.woff2", weight: "400", style: "italic" },
    { path: "../fonts/PPEditorialNew-Bold.woff2", weight: "700", style: "normal" },
  ],
});

// Body sans — Satoshi (variable)
const satoshi = localFont({
  variable: "--font-satoshi",
  display: "swap",
  src: [{ path: "../fonts/Satoshi-Variable.ttf", weight: "300 900", style: "normal" }],
});

export const metadata: Metadata = {
  title: "Monumental ERP",
  description: "First-pass ERP — module bill of materials, shopping list and inventory on one spine.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${editorial.variable} ${satoshi.variable}`}>
      <body>{children}</body>
    </html>
  );
}
