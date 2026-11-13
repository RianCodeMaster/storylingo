"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StoryRows } from "@/components/Stories";
import TopBar from "@/components/TopBar";
import { Waitlist } from "@/components/Waitlist";
import { useI18n } from "@/lib/i18n";
import { formatPrice, ownedProducts, type Price, PRODUCTS, visibleProducts } from "@/lib/products";
import { finishedStories, listStories } from "@/lib/story";
import { ensureLearner } from "@/lib/supabase";
import type { StoryCard } from "@/lib/types";

/**
 * A product's page. Who has it gets its content (kind stories: its stories, all levels). Who does not, sees what it
 * gives and its price, or a waitlist while it is coming. Buying in the app comes with Stripe; until then the
 * learner leaves an e-mail (the waitlist doubles as the list of people ready to buy).
 */
export function ProductPage({ slug }: { slug: string }) {
  const { lang, dict, fill, edition, home } = useI18n();
  const [owned, setOwned] = useState<Set<string> | null>(null);
  const [stories, setStories] = useState<StoryCard[] | null>(null);
  const [finished, setFinished] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const product = PRODUCTS[slug];

  useEffect(() => {
    (async () => {
      await ensureLearner(lang);
      const mine = await ownedProducts();
      setOwned(mine);
      if (mine.has(slug) && product?.kind === "stories") {
        const [list, done] = await Promise.all([listStories(edition, product.tags), finishedStories()]);
        setStories(list);
        setFinished(done);
      }
    })().catch((e) => setError(String(e.message ?? e)));
  }, [lang, edition, slug, product]);

  const text = product?.texts[edition.base];
  const priceLine = (price: Price) =>
    price.interval === "month"
      ? fill(dict.plus.perMonthOf, { price: formatPrice(price, lang) })
      : price.interval === "year"
        ? fill(dict.plus.yearly, {
            price: formatPrice(price, lang),
            monthly: formatPrice({ ...price, amount: Math.round(price.amount / 12) }, lang),
          })
        : `${formatPrice(price, lang)} · ${dict.product.once}`;
  if (error) return <main><p className="card">{fill(dict.common.error, { error })}</p></main>;
  if (!owned) return <main><p className="muted">{dict.common.loading}</p></main>;
  // Not offered here, or not for this learner (a draft, an owners-only product they do not have).
  if (!product || !text || !visibleProducts(edition, owned).some((p) => p.slug === slug)) {
    return (
      <main>
        <TopBar title="" />
        <p className="card">{dict.product.empty}</p>
      </main>
    );
  }

  const has = owned.has(slug);
  const forSale = product.status === "live" && product.prices.length > 0;
  return (
    <main>
      <TopBar title={text.title} />
      <section className="card product-head">
        <span className="product-icon">{text.icon}</span>
        <p>{text.text}</p>
        {has && <span className="badge">{dict.product.owned}</span>}
      </section>

      {text.perks.length > 0 && (
        <ul className="perks">
          {text.perks.map((perk) => (
            <li key={perk}>✓ {perk}</li>
          ))}
        </ul>
      )}

      {has ? (
        product.kind === "membership" ? (
          <Link className="cta" href={home}>
            {dict.nav.home} <span className="arrow">→</span>
          </Link>
        ) : product.kind !== "stories" ? (
          // A kind the app cannot show yet (exam, phrases): bought or given ahead of its content.
          <p className="card">{dict.product.empty}</p>
        ) : !stories ? (
          <p className="muted">{dict.common.loading}</p>
        ) : (
          <>
            <h2 className="section-title">{dict.product.contents}</h2>
            {stories.length ? <StoryRows stories={stories} finished={finished} /> : <p className="card">{dict.product.empty}</p>}
          </>
        )
      ) : forSale ? (
        <>
          {/* Every price as an option; the yearly one shows what it comes to per month. Paying comes with Stripe. */}
          <div className="prices">
            {product.prices.map((price) => (
              <button key={`${price.interval}`} className="price-option" disabled>
                {price.interval === "year" && product.prices.length > 1 && <span className="pill">{dict.plus.best}</span>}
                <strong>{priceLine(price)}</strong>
              </button>
            ))}
          </div>
          <Waitlist product={product} line={dict.product.payingSoon} />
        </>
      ) : (
        <Waitlist product={product} />
      )}
    </main>
  );
}
