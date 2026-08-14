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

/**
 * The product columns whose values reach an embedding — the taxonomy ids
 * `buildEmbeddingText` reads above, plus the photo the visual vector is
 * computed from.
 *
 * Kept beside `buildEmbeddingText` deliberately: these two must agree, and
 * the failure when they drift is silent in both directions — a field added
 * to the text but missing here leaves stale embeddings live, and a field
 * listed here but unused there retires embeddings for no reason. Adjacent
 * is the cheapest way to keep them honest.
 *
 * Price, stock, SEO copy, dimensions and box maths are all deliberately
 * ABSENT. Editing a price must not evict a product from search.
 */
export const EMBEDDING_RELEVANT_PRODUCT_FIELDS = [
  "materialId",
  "finishId",
  "surfaceLookId",
  "colorFamilyId",
  "applicationIds",
  "primaryMediaId",
] as const;

/**
 * Did this edit change anything an embedding is derived from?
 *
 * Compares only the fields above. Array values (`applicationIds`) are
 * compared by content, not identity — a form round-trip rebuilds the array
 * every time, so reference equality would report every save as a change.
 */
export function affectsEmbedding(
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
): boolean {
  return EMBEDDING_RELEVANT_PRODUCT_FIELDS.some((field) => {
    const a = before[field];
    const b = after[field];
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length !== b.length || a.some((v, i) => v !== b[i]);
    }
    return a !== b;
  });
}
