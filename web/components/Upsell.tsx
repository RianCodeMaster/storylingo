"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { type Tier, tierOf } from "@/lib/plus";
import { ownedProducts, type Product } from "@/lib/products";

/**
 * The way to Plus (docs/plus.md, "the moments"). A card where a limit is met or right after a success: one line that
 * says why, and one button. Every one leads to the same page: /<edition>/p/<plus>. Nothing when there is no Plus.
 */
export function Upsell({ plus, line, small = false }: { plus: Product | null; line: string; small?: boolean }) {
  const { dict, home } = useI18n();
  if (!plus) return null;
  const href = `${home}/p/${plus.slug}`;
  if (small) {
    return (
      <p className="upsell-small">
        {line}{" "}
        <Link href={href}>
          {dict.plus.cta} <span className="arrow">→</span>
        </Link>
      </p>
    );
  }
  return (
    <section className="card upsell">
      <p>{line}</p>
      <Link className="cta" href={href}>
        ⭐ {dict.plus.cta} <span className="arrow">→</span>
      </Link>
    </section>
  );
}

/** Always there, never in the way: the small label at the top of the start screen. */
export function PlusChip({ plus }: { plus: Product | null }) {
  const { dict, home } = useI18n();
  if (!plus) return null;
  return (
    <Link href={`${home}/p/${plus.slug}`} className="plus-chip">
      {dict.plus.chip}
    </Link>
  );
}

/** At the end of a story, for a learner without Plus: one small line under the score. */
export function AfterStoryPlus() {
  const { dict, edition } = useI18n();
  const [tier, setTier] = useState<Tier | null>(null);
  useEffect(() => {
    ownedProducts().then((owned) => setTier(tierOf(edition, owned)), () => {});
  }, [edition]);
  if (!tier?.limits) return null;
  return <Upsell plus={tier.plus} line={dict.plus.afterStory} small />;
}
