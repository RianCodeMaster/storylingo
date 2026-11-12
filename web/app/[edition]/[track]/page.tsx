import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Home } from "@/components/Home";
import { EDITIONS, trackOf } from "@/lib/editions";
import { getEdition } from "../dictionaries";

/**
 * A track: one way into an edition for one niche, e.g. /almanya/b1-examen (content/editions/<slug>.yaml, tracks).
 * The page is the edition's home with the track's own welcome, and its own title and description, so a search for
 * that niche finds this page and not only the general one. Unknown tracks are a 404.
 */
export function generateStaticParams({ params }: { params: { edition: string } }) {
  const tracks = (EDITIONS[params.edition]?.tracks ?? []).map((t) => ({ track: t.slug }));
  // Cache Components wants at least one address per edition; one without tracks gets a placeholder that is a 404.
  return tracks.length ? tracks : [{ track: NO_TRACK }];
}

const NO_TRACK = "-";

export async function generateMetadata({ params }: PageProps<"/[edition]/[track]">): Promise<Metadata> {
  const { edition } = await getEdition();
  const track = trackOf(edition, (await params).track);
  if (!track) return {};
  return {
    title: track.title,
    description: track.description,
    alternates: { canonical: `/${edition.slug}/${track.slug}` },
    openGraph: { title: track.title, description: track.description },
  };
}

export default async function TrackHome({ params }: PageProps<"/[edition]/[track]">) {
  const { edition } = await getEdition();
  const track = trackOf(edition, (await params).track);
  if (!track) notFound();
  return <Home trackSlug={track.slug} />;
}
