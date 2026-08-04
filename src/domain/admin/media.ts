/**
 * Media library types. `domain/` imports nothing (ADR-0003).
 */

export interface AdminMediaAsset {
  readonly id: string;
  readonly url: string;
  readonly publicId: string;
  readonly width: number | null;
  readonly height: number | null;
  /** Bytes as a plain number — the column is bigint, converted at the repository. */
  readonly bytes: number | null;
  readonly mimeType: string | null;
  readonly dominantColor: string | null;
  readonly tags: readonly string[];
  /** Alt text per locale. A missing key means no translation row exists yet. */
  readonly altText: Readonly<Record<string, string | null>>;
  /** How many product image slots reference this. Non-zero blocks deletion. */
  readonly usageCount: number;
  readonly createdAt: Date;
}

export interface AdminMediaPage {
  readonly assets: readonly AdminMediaAsset[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Alt text is an accessibility requirement, not a nice-to-have — docs/02
 * §7.1. This is what the library uses to flag the gaps, per locale, so
 * "which images still need Arabic alt text" is answerable at a glance
 * rather than by opening each one.
 */
export function missingAltLocales(
  asset: Pick<AdminMediaAsset, "altText">,
  locales: readonly string[],
): readonly string[] {
  return locales.filter((locale) => {
    const text = asset.altText[locale];
    return text === undefined || text === null || text.trim() === "";
  });
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
