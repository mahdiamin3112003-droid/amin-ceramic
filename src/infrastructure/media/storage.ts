/**
 * Supabase Storage paths and URLs — ADR-0013.
 *
 * One place that knows how a `media_asset` row becomes something an
 * `<img>` can load. Everything else passes `publicId` around and calls
 * `mediaUrl()`, so moving buckets, adding a CDN in front, or switching
 * provider later is a change here and nowhere else.
 */

/** Product imagery. Public-read; access control is on the writes. */
export const MEDIA_BUCKET = "media";

/**
 * The derivative ladder, generated once at upload (ADR-0013).
 *
 * Supabase has no `q_auto` and no named presets, so the sizes are fixed
 * here rather than requested per URL — a width that was never generated
 * cannot be asked for, which is the point. Values match the `sizes`
 * breakpoints the catalogue grid and PDP already use (docs/02 §6.2).
 */
export const DERIVATIVE_WIDTHS = [320, 640, 960, 1440, 2048] as const;

export type DerivativeWidth = (typeof DERIVATIVE_WIDTHS)[number];

function storageBase(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  return `${url}/storage/v1/object/public/${MEDIA_BUCKET}`;
}

/**
 * Public URL for a stored object.
 *
 * `secureUrl` wins when present: an asset ingested from elsewhere (or, if
 * ADR-0013 is ever revisited, from a CDN) carries its own absolute URL, and
 * reconstructing one from `publicId` would produce a path that does not
 * exist.
 */
export function mediaUrl(asset: {
  publicId: string;
  secureUrl: string | null;
}): string {
  return asset.secureUrl ?? `${storageBase()}/${asset.publicId}`;
}

/** Path of a generated derivative. Mirrors what `uploadMedia` writes. */
export function derivativePath(publicId: string, width: DerivativeWidth): string {
  const dot = publicId.lastIndexOf(".");
  const stem = dot === -1 ? publicId : publicId.slice(0, dot);
  // Always `.webp`: the ladder is re-encoded at upload, so the derivative's
  // format is ours to choose and does not follow the original's.
  return `${stem}@${String(width)}.webp`;
}

export function derivativeUrl(publicId: string, width: DerivativeWidth): string {
  return `${storageBase()}/${derivativePath(publicId, width)}`;
}

/** `srcSet` across the whole ladder, for a plain `<img>`. */
export function mediaSrcSet(publicId: string): string {
  return DERIVATIVE_WIDTHS.map(
    (w) => `${derivativeUrl(publicId, w)} ${String(w)}w`,
  ).join(", ");
}
