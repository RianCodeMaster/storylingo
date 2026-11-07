import type { Metadata } from "next";
import { Noto_Sans_Arabic, Plus_Jakarta_Sans } from "next/font/google";
import "../globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });
const arabic = Noto_Sans_Arabic({ variable: "--font-arabic", subsets: ["arabic"], preload: false, adjustFontFallback: false });

export const metadata: Metadata = { title: "StoryLingo", icons: { icon: "/icon.svg" } };

/** The overview at /: its own root layout, outside every edition (an edition fixes the language; this page does not). */
export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${arabic.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
