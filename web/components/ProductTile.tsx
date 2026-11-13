"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { formatPrice, type Product } from "@/lib/products";

/**
 * A product on the start screen, next to stories, words and phrases. Owned: it opens. Coming: "coming soon".
 * For sale: a lock and the price. Every state leads to the product's own page (/<edition>/p/<slug>).
 */
export function ProductTile({ product, owned }: { product: Product; owned: boolean }) {
  const { lang, dict, fill, edition, home } = useI18n();
  const text = product.texts[edition.base];
  if (!text) return null;
  // The lowest monthly price says the most at a glance ("6,99 € per month", or a one-off price as it is).
  const price = product.prices.find((p) => p.interval === "month") ?? product.prices[0];
  const sub = owned
    ? dict.product.owned
    : product.status === "coming" || !price
      ? dict.product.coming
      : price.interval === "month"
        ? `🔒 ${fill(dict.plus.perMonthOf, { price: formatPrice(price, lang) })}`
        : `🔒 ${formatPrice(price, lang)}`;
  return (
    <Link href={`${home}/p/${product.slug}`} className={`tile${owned ? "" : " tile-locked"}`}>
      <span className="tile-icon">{text.icon}</span>
      <strong>{text.title}</strong>
      <span className="tile-sub">{sub}</span>
    </Link>
  );
}
