/** Supabase returns an embedded row as an object or a one-element array, depending on the relation. */
export type One<T> = T | T[] | null;
export const one = <T,>(v: One<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export type AssetRef = One<{ id: string; storage_path: string }>;

/**
 * Public URL of a generated file, through the same /sb route the rest of the app uses.
 * The asset id is added as a version: a remade file keeps its path, and browsers cache files for an hour.
 */
export function assetUrl(ref: AssetRef): string | null {
  const asset = one(ref);
  return asset ? `${window.location.origin}/sb/storage/v1/object/public/assets/${asset.storage_path}?v=${asset.id}` : null;
}
