import Replicate from "replicate";

import type { ImageEmbeddingProvider, ImageEmbeddingResult } from "./types";

/**
 * SigLIP 2 image embedding via Replicate — docs/01-architecture.md §6.2,
 * provider choice recorded in the Phase 5 plan.
 *
 * No `import "server-only"` — see the same note in `openai-embeddings.ts`.
 * `REPLICATE_API_TOKEN` has no `NEXT_PUBLIC_` prefix, and this module's
 * second real caller, `prisma/backfill-embeddings.ts`, is a plain CLI
 * script that the guard would break outright (confirmed directly: it
 * throws unconditionally outside Next's bundler).
 *
 * `REPLICATE_SIGLIP_MODEL` has no hardcoded default deliberately: a Replicate
 * model reference is `owner/name:version-hash`, and guessing one would
 * either fail loudly (best case) or silently run the wrong model version
 * against every product photo (worst case, and hard to notice — the
 * pipeline would "work," just embed with something other than SigLIP 2).
 * Confirm the exact model + version on Replicate's model page, then set it.
 */
let cached: Replicate | null = null;

function client(): Replicate {
  if (cached) return cached;
  const auth = process.env.REPLICATE_API_TOKEN;
  if (!auth) {
    throw new Error("REPLICATE_API_TOKEN is required for visual embeddings");
  }
  cached = new Replicate({ auth });
  return cached;
}

function modelRef(): `${string}/${string}` | `${string}/${string}:${string}` {
  const ref = process.env.REPLICATE_SIGLIP_MODEL;
  if (!ref) {
    throw new Error(
      "REPLICATE_SIGLIP_MODEL is not set — confirm the exact SigLIP 2 " +
        "model and version on Replicate before running the backfill " +
        '(e.g. "owner/siglip2-large:abcdef123..."), then set it in ' +
        ".env.local. Not defaulted on purpose: a guessed model reference " +
        "would either fail loudly or, worse, silently embed with the " +
        "wrong model.",
    );
  }
  return ref as `${string}/${string}:${string}`;
}

/**
 * `varad-13/siglip-2-large`'s real output, confirmed by a direct probe
 * call (not assumed): a batch-wrapped array, `[[...]]` — one row per input
 * image, this client always sends exactly one. Unwrap that one row rather
 * than accepting a flat array, which was the original (wrong) guess this
 * function shipped with before being run for real.
 */
function asEmbeddingVector(output: unknown): readonly number[] {
  if (
    Array.isArray(output) &&
    output.length === 1 &&
    Array.isArray(output[0]) &&
    output[0].every((v) => typeof v === "number")
  ) {
    return output[0];
  }
  throw new Error(
    "Replicate output was not the expected [[...]] batch-wrapped vector " +
      "— the configured REPLICATE_SIGLIP_MODEL's output shape does not " +
      "match what this client expects.",
  );
}

/**
 * Replicate's `ApiError` carries the whole `Request` object, INCLUDING its
 * `Authorization: Bearer …` header. Anything that stringifies it — an
 * unhandled rejection, `console.error(cause)`, a log aggregator — prints
 * the API token in plaintext. That happened once during Phase 5 (a 429 from
 * the backfill), and the token had to be rotated.
 *
 * So no error from `run()` escapes this module intact: the status and
 * message are kept, the request/response objects are dropped. `cause` is
 * deliberately NOT attached — that is the whole object this exists to
 * discard.
 */
function redactedError(cause: unknown): Error {
  const status =
    typeof cause === "object" && cause !== null && "response" in cause
      ? (cause as { response?: { status?: number } }).response?.status
      : undefined;
  const message = cause instanceof Error ? cause.message : String(cause);

  // The message itself can echo the request line in some SDK errors; keep
  // only the first line, which is where the human-readable reason lives.
  const firstLine = message.split("\n")[0] ?? message;

  return new Error(
    `Replicate request failed${status !== undefined ? ` (HTTP ${String(status)})` : ""}: ${firstLine}`,
  );
}

/** Seconds Replicate asks us to wait, from a 429's `retry_after`. */
function retryAfterSeconds(cause: unknown): number | null {
  if (typeof cause !== "object" || cause === null || !("response" in cause)) {
    return null;
  }
  const response = (cause as { response?: { status?: number; headers?: Headers } })
    .response;
  if (response?.status !== 429) return null;
  const header = response.headers?.get("retry-after");
  const seconds = header === null || header === undefined ? NaN : Number(header);
  return Number.isFinite(seconds) ? seconds : 10;
}

const MAX_RATE_LIMIT_RETRIES = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const replicateVisualEmbeddings: ImageEmbeddingProvider = {
  async embedImage(imageUrl: string): Promise<ImageEmbeddingResult> {
    const start = Date.now();
    const ref = modelRef();

    /**
     * Replicate throttles hard on low-credit accounts (6 predictions/min,
     * burst 1, below $5 balance) — hit during the first real backfill. The
     * server tells us exactly how long to wait, so honour that rather than
     * guessing a fixed sleep between every call: a blanket delay would slow
     * every run forever to accommodate a condition that disappears the
     * moment the account is topped up.
     */
    for (let attempt = 0; ; attempt++) {
      try {
        const output = await client().run(ref, { input: { image: imageUrl } });
        return {
          embedding: asEmbeddingVector(output),
          model: ref,
          latencyMs: Date.now() - start,
        };
      } catch (cause) {
        const wait = retryAfterSeconds(cause);
        if (wait === null || attempt >= MAX_RATE_LIMIT_RETRIES) {
          throw redactedError(cause);
        }
        // +1s of headroom: `retry_after` is when the window resets, and
        // arriving exactly on the boundary tends to be throttled again.
        await sleep((wait + 1) * 1000);
      }
    }
  },
};

/** A 34-byte 1×1 WebP — validated as a real RIFF/WEBP file, not a pasted guess. */
const WARM_UP_PIXEL =
  "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";

/**
 * Queue a throwaway prediction to hold a model instance up. Does NOT wait
 * for the result.
 *
 * ── Why not just call `embedImage` ──
 * Because the cold start this exists to prevent is longer than any serverless
 * function is allowed to live. Measured directly: a cold `embedImage` took
 * **234,855 ms**. Vercel's ceiling is 60s on the current plan and 300s at
 * most on any plan, so a blocking warm-up would be killed every time the
 * model was actually cold — precisely when warming was needed.
 *
 * `predictions.create` returns once the prediction is QUEUED. Replicate then
 * runs it server-side whether or not anything is still listening, so the
 * instance comes up regardless of what happens to the caller. We never read
 * the vector; the side effect is the entire point.
 */
export async function warmUpVisualModel(): Promise<{ predictionId: string }> {
  const ref = modelRef();
  const [, versionOrName] = ref.split(":");

  try {
    const prediction = await client().predictions.create(
      versionOrName === undefined
        ? { model: ref, input: { image: WARM_UP_PIXEL } }
        : { version: versionOrName, input: { image: WARM_UP_PIXEL } },
    );
    return { predictionId: prediction.id };
  } catch (cause) {
    throw redactedError(cause);
  }
}
