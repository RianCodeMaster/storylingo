import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductPage } from "@/components/ProductPage";
import { PRODUCTS } from "@/lib/products";
import { getEdition } from "../../dictionaries";

/**
 * A product's page inside an edition: /almanya/p/dtz-training (content/products/<slug>.yaml). Whether the learner
 * may see it, and its content, is decided in the browser (and for the content by the database).
 */
export function generateStaticParams({ params }: { params: { edition: string } }) {
  const here = Object.values(PRODUCTS).filter((p) => p.editions.includes(params.edition));
  // Cache Components wants at least one address per edition; one without products gets a placeholder that is a 404.
  return here.length ? here.map((p) => ({ product: p.slug })) : [{ product: "-" }];
}

export async function generateMetadata({ params }: PageProps<"/[edition]/p/[product]">): Promise<Metadata> {
  const { edition } = await getEdition();
  const text = PRODUCTS[(await params).product]?.texts[edition.base];
  return text ? { title: `${text.title} · ${edition.name}`, description: text.text } : {};
}

export default async function Product({ params }: PageProps<"/[edition]/p/[product]">) {
  const { edition } = await getEdition();
  const product = PRODUCTS[(await params).product];
  if (!product?.editions.includes(edition.slug)) notFound();
  return <ProductPage slug={product.slug} />;
}
