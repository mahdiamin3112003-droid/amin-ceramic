import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

import type { ExtractedAttributes } from "@/domain/ai/explanation";

/**
 * Gemini Flash vision — docs/01-architecture.md §6.3 steps 3 and 4b.
 *
 * Two distinct jobs, deliberately two calls rather than one combined prompt:
 * the gate must be able to REJECT an image before anything else spends money
 * on it, and merging it into the extraction call would mean paying for
 * attribute extraction on photos that were never valid.
 *
 * No `import "server-only"` — same reasoning as the sibling providers: the
 * key has no `NEXT_PUBLIC_` prefix so Next never inlines it, and that guard
 * throws outside Next's bundler, which would break any CLI use.
 */

/**
 * A current pinned version, overridable by env — chosen from measurement,
 * after two wrong answers.
 *
 * ── What the wrong answers taught ──
 * `gemini-2.0-flash` (the original hardcode) is retired: 404 on every call.
 * `gemini-2.5-flash` fails the same way — "no longer available to new
 * users" — and note it STILL APPEARS in the models list, so listing a model
 * is not evidence you may call it. Anything picked from memory is a guess;
 * this family moves faster than that.
 *
 * ── Why THIS version ──
 * Probed with the real gate payload — the actual image and response schema,
 * not a toy prompt. `gemini-3.5/3.6/3.7-flash` and `gemini-flash-latest` all
 * classified the test tile correctly, so correctness did not separate them;
 * 3.7 was fastest by a wide margin (6.6s against 11s, 36s and 17s).
 *
 * A note on the alias, because the obvious inference is wrong: three
 * consecutive 503s on `gemini-flash-latest` looked like contention on the
 * default everyone reaches for. Pinning 3.7 then returned 503 as well. The
 * 503s are an intermittent upstream condition across the family, not a
 * property of the alias — which is why the answer below is a retry, not a
 * different model.
 *
 * `GEMINI_MODEL` overrides this, so the next retirement is an env change
 * rather than a code change and a deploy.
 */
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.7-flash";

/**
 * Retry transient upstream failures.
 *
 * Gemini returns `503 high demand` intermittently under its own load, and it
 * clears within seconds — observed repeatedly while verifying this file. A
 * customer waiting on a tile match should not be told the feature is broken
 * because the first attempt landed during a spike.
 *
 * Only 503. NOT 429, and that is a correction rather than an omission:
 * 429 here is `GenerateRequestsPerDayPerProjectPerModel-FreeTier` — a DAILY
 * quota. Retrying it cannot succeed, and each attempt consumes another unit
 * of the very allowance that ran out. A 404 (retired model) or 400 (bad
 * request) is likewise a fault that will not fix itself.
 */
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1200;

function isTransient(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message.includes("[503");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await operation();
    } catch (cause) {
      last = cause;
      if (!isTransient(cause) || attempt === MAX_ATTEMPTS - 1) throw cause;
      // Exponential: 1.2s, 2.4s. Enough for a demand spike to pass without
      // making a failing request feel hung.
      await sleep(BASE_BACKOFF_MS * 2 ** attempt);
    }
  }
  throw last;
}

let cached: GoogleGenerativeAI | null = null;

function client(): GoogleGenerativeAI {
  if (cached) return cached;
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_GENERATIVE_AI_API_KEY is required for the Tile Finder's safety " +
        "gate and attribute extraction. See .env.example.",
    );
  }
  cached = new GoogleGenerativeAI(apiKey);
  return cached;
}

/** §9.2's `finder_gate_result`. */
export type GateResult =
  "accepted" | "not_a_tile" | "too_dark" | "too_angled" | "unsafe";

export interface GateOutcome {
  readonly result: GateResult;
  /** The model actually used — reported rather than assumed, so `ai_interaction` records reality after a `GEMINI_MODEL` override. */
  readonly model: string;
  /** Shown to the visitor in STATE 4 when the gate rejects. Never free-form model prose — see below. */
  readonly reason: GateResult;
  readonly latencyMs: number;
}

export interface AttributeOutcome {
  readonly attributes: ExtractedAttributes;
  /** See the note on `GateOutcome.model`. */
  readonly model: string;
  /**
   * Free prose about the image, kept SEPARATE from the attributes above.
   *
   * The attributes are compared field-by-field against product rows and must
   * come from a closed vocabulary. This is the text that gets embedded for
   * the semantic kNN leg, where free language is the point. Conflating them
   * would either cripple the embedding or let uncontrolled text into a
   * specification comparison.
   */
  readonly description: string;
  readonly latencyMs: number;
}

/**
 * The vocabulary the model is allowed to answer with — passed IN, not
 * hardcoded here.
 *
 * Constraining the answer matters: a free-text "sandy taupe" cannot be
 * compared against a `color_family` row, so every downstream comparison
 * would silently degrade to "no opinion".
 *
 * But a list hardcoded in this file drifts from the taxonomy the moment an
 * admin adds a colour — and it already had: the first version of this file
 * listed `blue` and `green`, which this catalogue has never contained, so
 * the model could return a value matching no product. Reading the real keys
 * and passing them in makes that unrepresentable rather than a comment
 * asking someone to remember.
 */
export interface ExtractionVocabulary {
  readonly colorFamilies: readonly string[];
  readonly surfaceLooks: readonly string[];
  readonly finishes: readonly string[];
}

/**
 * Step 3 — is this actually a tile or surface photo?
 *
 * Two jobs at once: keep garbage out of the results (a photo of a dog will
 * still return twelve nearest neighbours, all wrong, presented confidently)
 * and stop the vision endpoint being used as a general-purpose image
 * classifier by anyone who finds the URL.
 *
 * The model returns one enum value, never prose. A rejection reason shown to
 * a visitor is UI copy the application owns; letting the model write it
 * would put unreviewed text on the page.
 */
export async function gateImage(
  imageBase64: string,
  mimeType: string,
): Promise<GateOutcome> {
  const start = Date.now();

  const model = client().getGenerativeModel({
    model: MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          result: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["accepted", "not_a_tile", "too_dark", "too_angled", "unsafe"],
          },
        },
        required: ["result"],
      },
    },
  });

  const response = await withRetry(() =>
    model.generateContent([
      {
        text:
          "You are a validity gate for a tile-matching search. Classify this " +
          "photograph.\n" +
          "accepted: a tile, slab, floor, wall or other flat architectural " +
          "surface, clearly enough lit and square-on enough to compare.\n" +
          "not_a_tile: anything else — people, animals, objects, screenshots, " +
          "documents.\n" +
          "too_dark: a surface, but underexposed enough that colour cannot be " +
          "judged.\n" +
          "too_angled: a surface, but at so oblique an angle that pattern scale " +
          "cannot be judged.\n" +
          "unsafe: sexual, violent, or otherwise unsuitable content.\n" +
          "Prefer 'accepted' when the photo is usable; only reject when it " +
          "genuinely is not.",
      },
      { inlineData: { data: imageBase64, mimeType } },
    ]),
  );

  const parsed = JSON.parse(response.response.text()) as { result?: string };
  const result = isGateResult(parsed.result) ? parsed.result : "not_a_tile";

  return { result, reason: result, model: MODEL, latencyMs: Date.now() - start };
}

function isGateResult(value: unknown): value is GateResult {
  return (
    value === "accepted" ||
    value === "not_a_tile" ||
    value === "too_dark" ||
    value === "too_angled" ||
    value === "unsafe"
  );
}

/**
 * Step 4b — structured attribute extraction.
 *
 * Feeds two things: the semantic embedding leg (the extracted description is
 * what gets embedded) and the grounded explanation (`domain/ai/explanation`
 * diffs these against each product's stored values).
 *
 * Every field is nullable and the prompt says so: a model forced to name a
 * finish it cannot see will invent one, and an invented attribute propagates
 * into both the ranking and the sentence justifying it.
 */
export async function extractAttributes(
  imageBase64: string,
  mimeType: string,
  vocabulary: ExtractionVocabulary,
): Promise<AttributeOutcome> {
  const start = Date.now();

  const model = client().getGenerativeModel({
    model: MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          colorFamily: {
            type: SchemaType.STRING,
            format: "enum",
            enum: [...vocabulary.colorFamilies],
            nullable: true,
          },
          surfaceLook: {
            type: SchemaType.STRING,
            format: "enum",
            enum: [...vocabulary.surfaceLooks],
            nullable: true,
          },
          finish: {
            type: SchemaType.STRING,
            format: "enum",
            enum: [...vocabulary.finishes],
            nullable: true,
          },
          formatGuess: { type: SchemaType.STRING, nullable: true },
          description: { type: SchemaType.STRING },
        },
        required: ["description"],
      },
    },
  });

  const response = await withRetry(() =>
    model.generateContent([
      {
        text:
          "Describe this tile or surface for a catalogue search.\n" +
          "Return null for any field you cannot judge confidently from the " +
          "photograph — a guess is worse than an absent value here, because it " +
          "will be compared against real product specifications.\n" +
          "formatGuess: the nominal size like '60x120' if the photo makes it " +
          "inferable, otherwise null.\n" +
          "description: one or two plain sentences about colour, pattern, " +
          "texture and the impression it gives. This is embedded for semantic " +
          "search, so describe what is visible rather than speculating about " +
          "material or suitability.",
      },
      { inlineData: { data: imageBase64, mimeType } },
    ]),
  );

  const parsed = JSON.parse(response.response.text()) as Record<string, unknown>;

  return {
    attributes: {
      colorFamily: asString(parsed.colorFamily),
      surfaceLook: asString(parsed.surfaceLook),
      finish: asString(parsed.finish),
      formatGuess: asString(parsed.formatGuess),
    },
    description: asString(parsed.description) ?? "",
    model: MODEL,
    latencyMs: Date.now() - start,
  };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
