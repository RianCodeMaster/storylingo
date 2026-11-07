"use client";

import { createContext, useContext } from "react";
import type nl from "@/dictionaries/nl.json";
import type { Edition } from "./editions";

/** Every base language has a dictionary with the same keys as Dutch (web/dictionaries/<code>.json). */
export type Dictionary = typeof nl;
type Plural = { other: string } & Partial<Record<Intl.LDMLPluralRule, string>>;

const I18nContext = createContext<{ lang: string; dict: Dictionary; edition: Edition } | null>(null);

/** The edition, its base language and that language's texts, for every client component below the layout. */
export function I18nProvider({
  lang,
  dict,
  edition,
  children,
}: {
  lang: string;
  dict: Dictionary;
  edition: Edition;
  children: React.ReactNode;
}) {
  return <I18nContext.Provider value={{ lang, dict, edition }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n outside I18nProvider");
  const { lang, dict, edition } = value;
  return {
    lang,
    dict,
    edition,
    /** The edition's home page: every link back goes here. */
    home: `/${edition.slug}`,
    /** Put values into a text: fill("{n} goed", { n: 3 }). */
    fill,
    /** The right plural form for n (Arabic has six, Dutch two), with the values filled in. */
    plural: (forms: Plural, n: number, vars: Record<string, string | number> = {}) =>
      fill(forms[new Intl.PluralRules(lang).select(n)] ?? forms.other, { n, ...vars }),
  };
}

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}
