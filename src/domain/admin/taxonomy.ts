/**
 * The taxonomy family — docs/04-api-architecture.md §14.1.
 *
 * §14.1 says nine resources "share one contract, which is why they get one
 * specification rather than nine". That is true of the OPERATIONS and false
 * of the field sets. In the real schema they come in four shapes:
 *
 *   keyed lookup + translations  material, finish, surface_look,
 *                                color_family, application, layout_pattern
 *   slug + inline name           brand
 *   slug + translations + status collection
 *   slug + ltree tree            category  (no translations at all)
 *
 * So the contract is modelled as a DESCRIPTOR rather than a base class: the
 * shared operations — list, activate, deactivate, reorder — are written
 * once against the descriptor, and each resource declares the extras it
 * carries. Pretending the shapes were uniform would mean either nine
 * near-identical screens or one screen full of `if (resource === …)`.
 *
 * `domain/` imports nothing (ADR-0003).
 */

/** The keyed-lookup family: identical shape, six members. */
export const KEYED_TAXONOMIES = [
  "material",
  "finish",
  "surface-look",
  "color-family",
  "application",
  "layout-pattern",
] as const;

export type KeyedTaxonomy = (typeof KEYED_TAXONOMIES)[number];

export interface TaxonomyDescriptor {
  readonly resource: KeyedTaxonomy;
  /** Plural, for headings and empty states. */
  readonly label: string;
  readonly singular: string;
  /** One line explaining what the vocabulary is FOR, shown under the heading. */
  readonly blurb: string;
  /** §14.1: taxonomy is `content.manage`. */
  readonly permission: string;
  /** A swatch column, for colour families. */
  readonly hasColor?: boolean;
  /** Layout patterns carry the wastage percentage the calculator uses. */
  readonly hasWastage?: boolean;
}

export const TAXONOMY_DESCRIPTORS: Readonly<
  Record<KeyedTaxonomy, TaxonomyDescriptor>
> = {
  material: {
    resource: "material",
    label: "Materials",
    singular: "material",
    blurb: "What the tile is made of — porcelain, ceramic, natural stone.",
    permission: "content.manage",
  },
  finish: {
    resource: "finish",
    label: "Finishes",
    singular: "finish",
    blurb: "How the surface is treated — matt, polished, lappato, structured.",
    permission: "content.manage",
  },
  "surface-look": {
    resource: "surface-look",
    label: "Surface looks",
    singular: "surface look",
    blurb: "What the tile imitates — marble, concrete, wood, terrazzo.",
    permission: "content.manage",
  },
  "color-family": {
    resource: "color-family",
    label: "Colour families",
    singular: "colour family",
    blurb:
      "The filter chip a customer clicks. Its swatch is the family's colour, not any one product's.",
    permission: "content.manage",
    hasColor: true,
  },
  application: {
    resource: "application",
    label: "Applications",
    singular: "application",
    blurb:
      "Where the tile may be used — bathroom floor, external paving, pool surround.",
    permission: "content.manage",
  },
  "layout-pattern": {
    resource: "layout-pattern",
    label: "Layout patterns",
    singular: "layout pattern",
    blurb:
      "Laying patterns and the wastage each implies. The quantity calculator reads these, so the percentages are commercial, not cosmetic.",
    permission: "content.manage",
    hasWastage: true,
  },
};

export function isKeyedTaxonomy(value: string): value is KeyedTaxonomy {
  return (KEYED_TAXONOMIES as readonly string[]).includes(value);
}

// ── Rows ─────────────────────────────────────────────────────────────────────

export interface TaxonomyTranslation {
  readonly locale: string;
  readonly name: string;
  readonly description: string | null;
}

export interface TaxonomyRow {
  readonly id: string;
  /** Immutable after creation — it is referenced by data AND by code (§14.1). */
  readonly key: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly colorHex: string | null;
  readonly defaultWastagePct: number | null;
  readonly translations: readonly TaxonomyTranslation[];
  /** How many products point at this row. Non-zero blocks deactivation. */
  readonly productCount: number;
}

/**
 * §14.1: "translations required for every `supported_locale` before
 * activation". Returns the locales still missing a name, so the UI can say
 * which rather than just refusing.
 *
 * A blank description is fine — it is optional copy. A blank NAME is not,
 * because the name is what renders in a filter chip.
 */
export function missingTranslations(
  row: Pick<TaxonomyRow, "translations">,
  requiredLocales: readonly string[],
): readonly string[] {
  return requiredLocales.filter((locale) => {
    const translation = row.translations.find((t) => t.locale === locale);
    return !translation || translation.name.trim() === "";
  });
}

/**
 * Why this row cannot be activated, or an empty list.
 *
 * Separated from `missingTranslations` because callers want the sentence,
 * not the locale codes.
 */
export function activationBlockers(
  row: Pick<TaxonomyRow, "translations">,
  requiredLocales: readonly string[],
): readonly string[] {
  return missingTranslations(row, requiredLocales).map(
    (locale) => `Missing ${locale.toUpperCase()} name`,
  );
}

/**
 * §14.1: "deactivation blocked while products reference the row, with the
 * count returned in the error."
 *
 * The rule is about DEACTIVATION, not deletion — these rows are never hard
 * deleted. A material still on 400 products must keep rendering on those
 * product pages; hiding it would blank a spec row on every one of them.
 */
export function canDeactivate(row: Pick<TaxonomyRow, "productCount">): boolean {
  return row.productCount === 0;
}

export function deactivationBlockedReason(
  row: Pick<TaxonomyRow, "productCount">,
  singular: string,
): string | null {
  if (canDeactivate(row)) return null;
  const n = row.productCount;
  return `${String(n)} product${n === 1 ? "" : "s"} still use this ${singular}. Move them first — hiding it would blank a spec row on every one.`;
}

/**
 * A reorder instruction: the whole visible list, in its new order.
 *
 * Sending the complete list rather than a single moved id is deliberate.
 * Sort orders drift — two rows can end up sharing a value through
 * concurrent edits or a bad import — and a "move item 3 above item 1"
 * instruction against drifted data produces an order nobody asked for.
 * Rewriting all of them is idempotent and self-healing.
 */
export interface ReorderInstruction {
  readonly id: string;
  readonly sortOrder: number;
}

export function reorder(
  ids: readonly string[],
  fromIndex: number,
  toIndex: number,
): ReorderInstruction[] {
  const next = [...ids];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) return next.map((id, i) => ({ id, sortOrder: i }));
  next.splice(toIndex, 0, moved);
  return next.map((id, i) => ({ id, sortOrder: i }));
}
