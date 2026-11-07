import type { Metadata, Viewport } from "next";
import { Noto_Sans_Arabic, Plus_Jakarta_Sans } from "next/font/google";
import type { CSSProperties } from "react";
import { DevToolsProvider } from "@/lib/devtools";
import { EDITIONS } from "@/lib/editions";
import { I18nProvider } from "@/lib/i18n";
import "../globals.css";
import { direction, script } from "@/lib/locales";
import { getEdition } from "./dictionaries";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

// Jakarta has no Arabic letters. Arabic pages put this font first (globals.css); without its own Arial-based
// fallback, so one word never mixes letters from two fonts (that breaks how Arabic letters join).
const arabic = Noto_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  preload: false,
  adjustFontFallback: false,
});

// Every edition is its own set of pages: /duits/…, /almanya/…, /spaans/….
export function generateStaticParams() {
  return Object.keys(EDITIONS).map((edition) => ({ edition }));
}

export async function generateMetadata(): Promise<Metadata> {
  const { edition } = await getEdition();
  return { title: edition.name, description: edition.tagline, icons: { icon: "/icon.svg" } };
}

export const viewport: Viewport = {
  themeColor: "#0F172A",
};

export default async function EditionLayout({ children }: LayoutProps<"/[edition]">) {
  const { edition, dict } = await getEdition();
  const base = edition.base;
  return (
    // Browser extensions (Grammarly, translators) add attributes to <html> and <body> before React starts;
    // suppressHydrationWarning ignores those two elements only, not the app inside them.
    <html
      lang={base}
      dir={direction(base)}
      data-script={script(base)}
      className={`${jakarta.variable} ${arabic.variable}`}
      // The edition's own color for buttons, progress and highlights.
      style={{ "--primary": edition.color } as CSSProperties}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <I18nProvider lang={base} dict={dict} edition={edition}>
          <DevToolsProvider>{children}</DevToolsProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
