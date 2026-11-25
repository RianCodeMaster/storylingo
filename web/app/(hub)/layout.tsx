import type { Metadata } from "next";
import { Noto_Sans_Arabic, Plus_Jakarta_Sans } from "next/font/google";
import { headers } from "next/headers";
import { direction, script } from "@/lib/locales";
import { guessBase } from "@/lib/visitor";
import "../globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });
const arabic = Noto_Sans_Arabic({ variable: "--font-arabic", subsets: ["arabic"], preload: false, adjustFontFallback: false });

export const metadata: Metadata = { icons: { icon: "/icon.svg" } };

// Rendered per visitor (the language comes from their browser), never prerendered: a short wait, no wrong language.
export const instant = false;

/**
 * The pages outside every edition (the landing page at /, the owner's overview at /editions): their own root layout,
 * in the language the visitor's browser suggests, so the first paint is already right (the landing page switches it
 * when the visitor picks another language).
 */
export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const base = guessBase(h.get("accept-language"), h.get("x-vercel-ip-country"));
  return (
    <html
      lang={base}
      dir={direction(base)}
      data-script={script(base)}
      className={`${jakarta.variable} ${arabic.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
