"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";

/**
 * The bar above every page below the start screen: one way back (to the start screen, never deeper) and the page's
 * name. The app has only two layers, start screen and a section, so getting lost is not possible.
 */
export default function TopBar({ title }: { title: string }) {
  const { dict, home } = useI18n();
  return (
    <header className="topbar">
      <Link href={home} className="topbar-back" aria-label={dict.nav.home}>
        <span className="arrow">←</span>
      </Link>
      <h1>{title}</h1>
    </header>
  );
}
