/**
 * "Why this matches" — the domain entity.
 *
 * docs/01-architecture.md §6.3 step 7: "Gemini generates a one-sentence 'why
 * this matches' grounded ONLY in the diff between extracted attributes and
 * each product's stored attributes. Never free-form — this is what stops the
 * AI inventing specifications."
 *
 * ── Why no model is called here at all ──
 * The doc names Gemini, but the binding requirement in that sentence is the
 * grounding, not the generator. A model asked to write "one sentence about
 * the difference" can still emit "and it's frost-resistant" — plausible,
 * unverifiable, and a specification claim on a product a contractor may
 * order from. Composing the sentence from a real field comparison makes that
 * class of failure structurally impossible rather than merely discouraged by
 * a prompt, and removes a paid call from the hot path.
 *
 * The cost is prose that is more uniform than an LLM's. For a sentence whose
 * entire job is to justify a ranking with facts, that is the right trade.
 * Recorded in the Phase 6 ADR.
 *
 * The domain layer imports nothing (§5.3).
 */

/** What the vision model reported about the customer's photo. Every field optional — it may be unsure. */
export interface ExtractedAttributes {
  readonly colorFamily?: string | null;
  readonly surfaceLook?: string | null;
  readonly finish?: string | null;
  /** e.g. "60x120". A guess from the photo, so it is never asserted as fact. */
  readonly formatGuess?: string | null;
}

/** The candidate product's own stored values — the only source of truth a claim may come from. */
export interface ProductAttributes {
  readonly colorFamily: string;
  readonly surfaceLook: string;
  readonly finish: string;
  readonly nominalFormat: string | null;
}

export interface MatchExplanation {
  /** One sentence, safe to render. Empty when nothing could be compared. */
  readonly sentence: string;
  /** Attribute keys that agreed — drives the UI's "Why? ⓘ" detail. */
  readonly matched: readonly string[];
  readonly differed: readonly string[];
}

function normalise(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim().toLowerCase().replace(/_/g, " ");
  return trimmed === "" ? null : trimmed;
}

/**
 * Compare one extracted attribute against the product's stored value.
 * Returns null when the model had no opinion — an absent reading is not a
 * difference, and reporting it as one would invent a disagreement.
 */
function compare(
  extracted: string | null | undefined,
  actual: string | null,
): "match" | "differ" | null {
  const a = normalise(extracted);
  const b = normalise(actual);
  if (a === null || b === null) return null;
  return a === b ? "match" : "differ";
}

/**
 * Build the sentence.
 *
 * Only ever mentions an attribute that BOTH the vision model reported and
 * the product actually stores. A product field the model said nothing about
 * is never mentioned — that is the rule that keeps this from becoming a spec
 * sheet the customer did not ask about and we did not verify.
 */
export function explainMatch(
  extracted: ExtractedAttributes,
  product: ProductAttributes,
): MatchExplanation {
  const fields: readonly {
    key: string;
    label: (value: string) => string;
    verdict: "match" | "differ" | null;
    actual: string | null;
  }[] = [
    {
      key: "colour",
      label: (v) => `${v} colour`,
      verdict: compare(extracted.colorFamily, product.colorFamily),
      actual: normalise(product.colorFamily),
    },
    {
      key: "look",
      label: (v) => `${v} look`,
      verdict: compare(extracted.surfaceLook, product.surfaceLook),
      actual: normalise(product.surfaceLook),
    },
    {
      key: "finish",
      label: (v) => `${v} finish`,
      verdict: compare(extracted.finish, product.finish),
      actual: normalise(product.finish),
    },
    {
      key: "format",
      label: (v) => `${v} format`,
      verdict: compare(extracted.formatGuess, product.nominalFormat),
      actual: normalise(product.nominalFormat),
    },
  ];

  const matched = fields.filter((f) => f.verdict === "match");
  const differed = fields.filter((f) => f.verdict === "differ");

  const parts: string[] = [];

  if (matched.length > 0) {
    const phrases = matched.map((f) =>
      f.actual === null ? f.key : f.label(f.actual),
    );
    parts.push(`Same ${joinReadable(phrases)}`);
  }

  if (differed.length > 0) {
    // States what the PRODUCT is, never what the photo "should" be — the
    // product value is the one we can stand behind.
    const phrases = differed.map((f) =>
      f.actual === null ? f.key : f.label(f.actual),
    );
    parts.push(
      matched.length > 0
        ? `differs in ${joinReadable(differed.map((f) => f.key))} (this tile is ${joinReadable(phrases)})`
        : `This tile is ${joinReadable(phrases)}`,
    );
  }

  return {
    sentence: parts.length === 0 ? "" : `${parts.join("; ")}.`,
    matched: matched.map((f) => f.key),
    differed: differed.map((f) => f.key),
  };
}

function joinReadable(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0] ?? "";
  const head = items.slice(0, -1).join(", ");
  const tail = items[items.length - 1] ?? "";
  return `${head} and ${tail}`;
}
