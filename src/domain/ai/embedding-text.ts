/**
 * Canonical text built from a product's own fields for the semantic
 * embedding (docs/01-architecture.md §6.1's `semantic_embedding` —
 * "meaning: 'modern', 'luxury bathroom', 'warm neutral', spec language").
 *
 * Pure — no DB, no network (§5.3). One place that decides what goes into
 * the embedded text, so the backfill script and any future re-embed path
 * (live product edits) build the exact same string for the same product.
 */
export interface EmbeddingTextInput {
  readonly name: string;
  readonly description: string | null;
  readonly material: string;
  readonly finish: string;
  readonly surfaceLook: string;
  readonly colorFamily: string;
  readonly applications: readonly string[];
}

export function buildEmbeddingText(input: EmbeddingTextInput): string {
  const parts = [
    input.name,
    input.description,
    `${input.material} tile`,
    `${input.finish} finish`,
    `${input.surfaceLook} look`,
    `${input.colorFamily} colour`,
    input.applications.length > 0 ? input.applications.join(", ") : null,
  ];
  return parts.filter((p): p is string => p !== null && p.trim() !== "").join(". ");
}
