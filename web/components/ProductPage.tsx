"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StoryRows } from "@/components/Stories";
import TopBar from "@/components/TopBar";
import { Waitlist } from "@/components/Waitlist";
import { currentAccount } from "@/lib/account";
import { startCheckout } from "@/lib/checkout";
import { useI18n } from "@/lib/i18n";
import { formatPrice, ownedProducts, type Price, PRODUCTS, visibleProducts } from "@/lib/products";
import { finishedStories, listStories } from "@/lib/story";
import { ensureLearner } from "@/lib/supabase";
import type { StoryCard } from "@/lib/types";

// Paying is on once Stripe is set up where the app runs (docs/stripe.md); until then a product for sale has a
// waitlist, as before. Locally on in .env.local, online in Vercel.
const PAYMENTS = process.env.NEXT_PUBLIC_PAYMENTS === "1";

/**
 * A product's page. Who has it gets its content (kind stories: its stories, all levels). Who does not, sees what it
 * gives and its prices, picks one and pays on Stripe's own page (docs/stripe.md); a product that is coming has a
 * waitlist instead. Back from Stripe (?paid=1) the page waits until the webhook has opened the product.
 */
export function ProductPage({ slug }: { slug: string }) {
  const { lang, dict, fill, edition, home } = useI18n();
  const [owned, setOwned] = useState<Set<string> | null>(null);
  const [anonymous, setAnonymous] = useState(true);
  const [stories, setStories] = useState<StoryCard[] | null>(null);
  const [finished, setFinished] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const product = PRODUCTS[slug];
  // The yearly price is chosen at first: it is the better deal, and the one most worth showing.
  const [choice, setChoice] = useState<Price | null>(
    () => product?.prices.find((p) => p.interval === "year") ?? product?.prices[0] ?? null,
  );
  const [waiver, setWaiver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [welcome, setWelcome] = useState(false);

  useEffect(() => {
    (async () => {
      await ensureLearner(lang);
      let mine = await ownedProducts();
      setAnonymous((await currentAccount())?.anonymous ?? true);
      // Back from paying: Stripe tells our server a moment later, so wait for the product to open (up to ~30 s).
      if (new URLSearchParams(window.location.search).has("paid") && !mine.has(slug)) {
        setNote(dict.pay.processing);
        for (let i = 0; i < 15 && !mine.has(slug); i++) {
          await new Promise((r) => setTimeout(r, 2000));
          mine = await ownedProducts();
        }
        setNote(mine.has(slug) ? null : dict.pay.slow);
        if (mine.has(slug)) setWelcome(true);
      }
      setOwned(mine);
      if (mine.has(slug) && product?.kind === "stories") {
        const [list, done] = await Promise.all([listStories(edition, product.tags), finishedStories()]);
        setStories(list);
        setFinished(done);
      }
    })().catch((e) => setError(String(e.message ?? e)));
  }, [lang, edition, slug, product, dict.pay]);

  async function pay() {
    if (!choice || !product) return;
    if (!waiver) return setNote(dict.pay.waiverNeeded);
    setBusy(true);
    setNote(null);
    const problem = await startCheckout(product.slug, choice.interval ?? null, edition.slug, waiver).catch(() => "server");
    if (problem) {
      setBusy(false);
      setNote(problem === "owned" ? dict.pay.owned : problem === "account" ? dict.pay.needAccount : dict.pay.failed);
    }
  }

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
  if (!owned) return <main><p className="muted">{note ?? dict.common.loading}</p></main>;
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
      {welcome && <p className="card pay-welcome">🎉 {dict.pay.done}</p>}
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
      ) : forSale && !PAYMENTS ? (
        <Waitlist product={product} line={dict.product.payingSoon} />
      ) : forSale ? (
        <>
          {/* Every price as an option; the yearly one shows what it comes to per month. */}
          <div className="prices" role="radiogroup">
            {product.prices.map((price) => (
              <button
                key={`${price.interval}`}
                role="radio"
                aria-checked={choice === price}
                className={`price-option${choice === price ? " price-chosen" : ""}`}
                onClick={() => setChoice(price)}
              >
                {price.interval === "year" && product.prices.length > 1 && <span className="pill">{dict.plus.best}</span>}
                <strong>{priceLine(price)}</strong>
              </button>
            ))}
          </div>
          {anonymous ? (
            // Paying needs an account: a purchase on this browser alone would be lost with it.
            <section className="card">
              <p>{dict.pay.needAccount}</p>
              <Link className="cta" href={`${home}/account?next=${encodeURIComponent(`${home}/p/${slug}`)}`}>
                {dict.pay.toAccount} <span className="arrow">→</span>
              </Link>
            </section>
          ) : (
            <>
              <label className="check">
                <input type="checkbox" checked={waiver} onChange={(e) => setWaiver(e.target.checked)} />
                {dict.pay.waiver}
              </label>
              <button className="cta" disabled={busy || !choice} onClick={() => void pay()}>
                {busy ? dict.pay.busy : dict.pay.buy} {!busy && <span className="arrow">→</span>}
              </button>
              <p className="muted small">
                {dict.pay.secure} {dict.pay.agree} <Link href={`${home}/terms`}>{dict.pay.terms}</Link>{" "}
                {dict.pay.and} <Link href={`${home}/privacy`}>{dict.pay.privacy}</Link>.
              </p>
            </>
          )}
          {note && <p className="card small">{note}</p>}
        </>
      ) : (
        <Waitlist product={product} />
      )}
    </main>
  );
}
