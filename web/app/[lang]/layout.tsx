import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { I18nProvider } from "@/lib/i18n";
import "../globals.css";
import { direction, getDictionary, locales } from "./dictionaries";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

// Every base language is its own set of pages: /nl/…, later /en/… and /ar/….
export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getDictionary();
  return { title: "StoryLingo", description: dict.meta.description, icons: { icon: "/icon.svg" } };
}

export const viewport: Viewport = {
  themeColor: "#0F172A",
};

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const { locale, dict } = await getDictionary();
  return (
    <html lang={locale} dir={direction(locale)} className={jakarta.variable}>
      <body>
        <I18nProvider lang={locale} dict={dict}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
