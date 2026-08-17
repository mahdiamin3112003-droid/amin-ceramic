import { retrieveProducts } from "@/application/use-cases/ai/retrieve-core";
import {
  bucketFor,
  consumeAll,
  TILE_FINDER_PER_IP,
  TILE_FINDER_PER_VISITOR,
} from "@/application/auth/rate-limit";
import { calibrateScore, isConfidentMatch } from "@/domain/ai/calibration";
import { explainMatch, type ExtractedAttributes } from "@/domain/ai/explanation";
import type { ProductSummary } from "@/domain/product/entity";
import {
  extractAttributes,
  gateImage,
  type GateResult,
} from "@/infrastructure/ai/providers/gemini-vision";
import { openAiTextEmbeddings } from "@/infrastructure/ai/providers/openai-embeddings";
import { replicateVisualEmbeddings } from "@/infrastructure/ai/providers/replicate-visual";
import { logAiInteraction } from "@/infrastructure/db/repositories/ai-interaction-repository";
import { getExtractionVocabulary } from "@/infrastructure/db/repositories/embedding-repository";
import {
  getRequestContext,
  withRequestContext,
  type RequestTransaction,
} from "@/infrastructure/db/request-context";
import { getProductSummariesByIds } from "@/infrastructure/db/repositories/product-repository";
import { ensureVisitor } from "@/infrastructure/db/repositories/visitor-repository";
import { mediaUrl } from "@/infrastructure/media/storage";
import { uploadFinderQuery } from "@/infrastructure/media/upload";

/**
 * The Tile Finder pipeline — docs/01-architecture.md §6.3.
 *
 * ── Why this is two calls and not one ──
 * Step 4a (the SigLIP visual embedding) is the slow half: measured at 1.6s
 * warm and 234,855 ms cold, against a serverless ceiling far below that. The
 * gate and attribute extraction are ~1-2s. Running them together would make
 * the fast, always-available half hostage to the slow, sometimes-impossible
 * one.
 *
 * So `startFinderSession` does the fast half and persists what it learned;
 * `matchFinderSession` does the slow half against that saved state. The
 * session id is shareable (§9.2), so a visitor who loses the tab still has
 * their result, and the ANALYSING state in docs/02 §3.4 has real stages to
 * tick rather than a spinner pretending to work.
 *
 * Step 6 (cross-encoder rerank) is deliberately absent — reranking "the top
 * 12" of a twelve-product catalogue reorders everything and discriminates
 * nothing. Revisit past ~100 products.
 */

const RESULT_LIMIT = 12;

export interface StartFinderInput {
  readonly bytes: Buffer;
  readonly mimeType: string;
  /** Already-hashed by the caller? No — raw, hashed here via `bucketFor`. */
  readonly ipAddress: string;
}

export type StartFinderOutcome =
  | { readonly kind: "rate_limited"; readonly retryAfterSeconds: number }
  | { readonly kind: "invalid"; readonly error: string }
  | {
      readonly kind: "rejected";
      readonly sessionId: string;
      readonly gate: GateResult;
      readonly imageUrl: string;
    }
  | {
      readonly kind: "accepted";
      readonly sessionId: string;
      readonly attributes: ExtractedAttributes;
      readonly imageUrl: string;
    };

/**
 * Steps 1-4b: store, gate, extract. Fast enough to answer inline.
 *
 * The rate limit is consumed BEFORE the image is stored or any model is
 * called — a limiter that runs after the expensive work has not limited
 * anything.
 */
export async function startFinderSession(
  input: StartFinderInput,
): Promise<StartFinderOutcome> {
  const { tenantId, visitorId } = await getRequestContext();

  const limited = await withRequestContext({ tenantId, visitorId }, (tx) =>
    consumeAll(tx, tenantId, [
      {
        bucket: bucketFor("tf:visitor", visitorId ?? input.ipAddress),
        rule: TILE_FINDER_PER_VISITOR,
      },
      { bucket: bucketFor("tf:ip", input.ipAddress), rule: TILE_FINDER_PER_IP },
    ]),
  );

  if (!limited.allowed) {
    return {
      kind: "rate_limited",
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((limited.resetAt.getTime() - Date.now()) / 1000),
      ),
    };
  }

  const stored = await uploadFinderQuery(tenantId, {
    type: input.mimeType,
    bytes: input.bytes,
  });
  if (!stored.ok) return { kind: "invalid", error: stored.error };

  const imageUrl = mediaUrl({ publicId: stored.publicId, secureUrl: null });
  const base64 = input.bytes.toString("base64");

  // Step 3 — the gate runs before extraction so a rejected photo never pays
  // for the second call.
  const gate = await gateImage(base64, input.mimeType);

  if (gate.result !== "accepted") {
    await logGateCall(tenantId, visitorId, gate, {
      status: gate.result === "unsafe" ? "filtered" : "success",
    });
    const sessionId = await withRequestContext({ tenantId, visitorId }, (tx) =>
      createSession(tx, tenantId, visitorId, {
        gateResult: gate.result,
        attributes: null,
        description: null,
        imagePublicId: stored.publicId,
      }),
    );
    return { kind: "rejected", sessionId, gate: gate.result, imageUrl };
  }

  // Step 4b — vocabulary comes from the live taxonomy, never a hardcoded
  // list (see `ExtractionVocabulary`).
  const vocabulary = await withRequestContext({ tenantId }, (tx) =>
    getExtractionVocabulary(tx, tenantId),
  );
  const extracted = await extractAttributes(base64, input.mimeType, vocabulary);

  await logGateCall(tenantId, visitorId, gate, { status: "success" });
  await withRequestContext({ tenantId, visitorId }, (tx) =>
    logAiInteraction(tx, tenantId, {
      feature: "tile_finder",
      provider: "gemini",
      model: extracted.model,
      operation: "vision",
      imageCount: 1,
      latencyMs: extracted.latencyMs,
      status: "success",
    }),
  );

  const sessionId = await withRequestContext({ tenantId, visitorId }, (tx) =>
    createSession(tx, tenantId, visitorId, {
      gateResult: "accepted",
      attributes: extracted.attributes,
      description: extracted.description,
      imagePublicId: stored.publicId,
    }),
  );

  return {
    kind: "accepted",
    sessionId,
    attributes: extracted.attributes,
    imageUrl,
  };
}

/**
 * Telemetry for the gate call, in its OWN transaction.
 *
 * Same reasoning as the match path: these rows record spend that has
 * ALREADY happened, so they must not share a transaction with the write
 * they precede. Bundling them made the session-write transaction four
 * statements long, and it exceeded the 15s budget for real (P2028,
 * "transaction already closed") on a slow link — losing both the telemetry
 * and the session for a search whose paid work had completed.
 */
async function logGateCall(
  tenantId: string,
  visitorId: string | null,
  gate: { model: string; latencyMs: number },
  opts: { status: "success" | "filtered" },
): Promise<void> {
  await withRequestContext({ tenantId, visitorId }, (tx) =>
    logAiInteraction(tx, tenantId, {
      feature: "safety_gate",
      provider: "gemini",
      model: gate.model,
      operation: "vision",
      imageCount: 1,
      latencyMs: gate.latencyMs,
      status: opts.status,
    }),
  );
}

async function createSession(
  tx: RequestTransaction,
  tenantId: string,
  visitorId: string | null,
  data: {
    gateResult: GateResult;
    attributes: ExtractedAttributes | null;
    description: string | null;
    imagePublicId: string;
  },
): Promise<string> {
  if (!visitorId) {
    // `finder_session.visitor_id` is NOT NULL — every public request already
    // carries the `ac_vid` cookie middleware mints, so this is a genuine
    // invariant violation rather than an anonymous-visitor case.
    throw new Error("a finder session requires a visitor");
  }

  /**
   * The cookie is not the row. Middleware mints `ac_vid` on first request,
   * but `visitor` is written lazily by whichever feature first needs it —
   * so a visitor whose first action is a tile search has an id that
   * satisfies the cookie and violates `finder_session_visitor_id_fkey`.
   * Every other visitor-owned write does this first (basket, wishlist,
   * samples); this one has to as well.
   */
  await ensureVisitor(tx, tenantId, visitorId);

  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO finder_session (
      id, tenant_id, visitor_id, gate_result, extracted_attributes, image_phash
    ) VALUES (
      uuid_generate_v7(), ${tenantId}::uuid, ${visitorId}::uuid,
      ${data.gateResult}::finder_gate_result,
      ${JSON.stringify({
        ...(data.attributes ?? {}),
        description: data.description,
        imagePublicId: data.imagePublicId,
      })}::jsonb,
      NULL
    )
    RETURNING id
  `;

  const id = rows[0]?.id;
  if (!id) throw new Error("finder session insert returned no id");
  return id;
}

export interface FinderMatch {
  readonly productId: string;
  readonly percent: number;
  readonly band: "strong" | "moderate" | "weak" | "none";
  readonly isProvisional: boolean;
  readonly explanation: string;
}

export interface MatchOutcome {
  readonly sessionId: string;
  readonly matches: readonly FinderMatch[];
  /**
   * The matched products themselves, so a caller can render a result card
   * without a second request.
   *
   * The UI first fetched these from `/api/v1/products/compare`, which was
   * wrong twice over: that endpoint exists for the 2–4 product compare
   * table and its schema caps `ids` at four, so a twelve-result ranking
   * 400'd and every row silently rendered as nothing. Returning them here
   * removes both the cap and the round trip.
   */
  readonly products: readonly ProductSummary[];
  /** False when the top result is below the confidence bar — docs/02 §3.4 STATE 4. */
  readonly isConfident: boolean;
  /**
   * True when the visual leg did not complete and the ranking came from the
   * semantic leg alone. Surfaced so the UI can say so rather than implying a
   * visual comparison that never happened.
   */
  readonly visualDegraded: boolean;
}

/**
 * Steps 4a + 5 + 7 + 8: embed, retrieve, fuse, calibrate, explain, persist.
 *
 * ── The degradation path is the point ──
 * If Replicate is cold the visual embedding can exceed any function's
 * lifetime. Rather than hang or fail, this falls back to the semantic leg —
 * built from Gemini's description of the photo — and reports
 * `visualDegraded: true`. Semantic-only results are genuinely weaker (§6.2
 * is explicit that text embeddings cannot tell one veining pattern from
 * another), so the UI must not present them as a visual match.
 */
export async function matchFinderSession(
  sessionId: string,
  locale = "en",
): Promise<MatchOutcome> {
  const { tenantId, visitorId } = await getRequestContext();

  const session = await withRequestContext({ tenantId, visitorId }, (tx) =>
    loadSession(tx, tenantId, sessionId),
  );
  if (!session) throw new Error("finder session not found");
  if (session.gateResult !== "accepted") {
    return {
      sessionId,
      matches: [],
      products: [],
      isConfident: false,
      visualDegraded: false,
    };
  }

  const imageUrl = mediaUrl({
    publicId: session.imagePublicId,
    secureUrl: null,
  });

  // Sequential, not Promise.all: the two legs hit different vendors, but
  // pairing a 1.6s call with one that may take minutes means the fast one's
  // result sits unused for the same duration either way — and the memory
  // note on transaction/connection contention applies to what follows.
  const semantic = await openAiTextEmbeddings.embedText(
    session.description === null || session.description === ""
      ? "tile"
      : session.description,
  );

  let visual: readonly number[] | null = null;
  let visualLatencyMs = 0;
  try {
    const encoded = await replicateVisualEmbeddings.embedImage(imageUrl);
    visual = encoded.embedding;
    visualLatencyMs = encoded.latencyMs;
  } catch (cause) {
    // Message only — never the object. See replicate-visual.ts.
    console.error(
      "[tile-finder] visual embedding failed, degrading to semantic:",
      cause instanceof Error ? cause.message : String(cause),
    );
  }

  /**
   * Cost telemetry in its OWN transaction, separate from retrieval.
   *
   * These two writes and the two kNN calls were one transaction, and it
   * timed out for real: 15s budget, 21s elapsed, killing a search whose
   * paid work had already completed.
   *
   * Splitting is not just shorter, it is more correct. `admin-mutation.ts`
   * binds an AUDIT row to its mutation because an audit entry for a
   * rolled-back write would be a lie. Cost telemetry is the opposite: the
   * provider has already been called and already billed us by the time
   * these rows are written, so that spend is true whether or not retrieval
   * then succeeds. Tying it to retrieval's fate would DISCARD the record of
   * money actually spent precisely when something went wrong — which is
   * when the record matters most.
   */
  await withRequestContext({ tenantId, visitorId }, async (tx) => {
    await logAiInteraction(tx, tenantId, {
      feature: "embedding_semantic",
      provider: "openai",
      model: semantic.model,
      operation: "embed",
      inputTokens: semantic.inputTokens,
      latencyMs: semantic.latencyMs,
      status: "success",
      referenceId: sessionId,
    });
    if (visual) {
      await logAiInteraction(tx, tenantId, {
        feature: "embedding_visual",
        provider: "siglip_host",
        model: "siglip",
        operation: "embed",
        imageCount: 1,
        latencyMs: visualLatencyMs,
        status: "success",
        referenceId: sessionId,
      });
    }
  });

  const fused = await withRequestContext({ tenantId, visitorId }, (tx) =>
    retrieveProducts(tx, tenantId, {
      // With no visual vector the visual leg simply returns nothing to fuse;
      // an all-zero vector would be WRONG rather than absent, ranking by
      // proximity to a meaningless point.
      visualEmbedding: visual ?? [],
      semanticEmbedding: semantic.embedding,
      limit: RESULT_LIMIT,
    }),
  );

  const products = await withRequestContext({ tenantId }, (tx) =>
    loadProductAttributes(
      tx,
      tenantId,
      fused.map((f) => f.productId),
    ),
  );

  const matches: FinderMatch[] = fused
    .map((f) => {
      // Semantic-only results have no visual distance, so there is no
      // calibrated visual score to show. Calibration answers "how much does
      // this LOOK like the photo", which the semantic leg cannot speak to.
      const score = f.calibratedScore ?? calibrateScore(f.semanticDistance ?? 1);
      const attrs = products.get(f.productId);
      return {
        productId: f.productId,
        percent: score.percent,
        band: score.band,
        isProvisional: score.isProvisional,
        explanation: attrs
          ? explainMatch(session.attributes ?? {}, attrs).sentence
          : "",
      };
    })
    /**
     * Present in score order, not in fused order.
     *
     * RRF ranks by how highly BOTH legs rated a product; the number on the
     * card is the calibrated VISUAL similarity. Those are two different
     * orderings, and the first real query showed exactly how badly they can
     * disagree: the correct tile scored 98% and came back FOURTH, under
     * three products scoring 52%, 58% and 32%. A list reading
     * "52%, 58%, 32%, 98%" looks broken, and worse, it buries the right
     * answer where nobody scrolls.
     *
     * The cause is not a bug in RRF. With twelve products the semantic leg —
     * a model's description of a photo, matched against product copy — is
     * noisy enough to outvote a near-exact visual match. RRF is still the
     * right way to CHOOSE candidates and will earn its keep on a large
     * catalogue; it is the wrong thing to sort the final list by when the
     * list displays a different number.
     */
    .sort((a, b) => b.percent - a.percent);

  const top = matches[0];
  const isConfident =
    top !== undefined &&
    visual !== null &&
    isConfidentMatch({
      percent: top.percent,
      band: top.band,
      isProvisional: top.isProvisional,
    });

  await withRequestContext({ tenantId, visitorId }, (tx) =>
    persistResults(tx, sessionId, matches, {
      topScore: top?.percent ?? null,
      band: top?.band ?? "none",
      latencyMs: visualLatencyMs + semantic.latencyMs,
    }),
  );

  const summaries = await withRequestContext({ tenantId }, (tx) =>
    getProductSummariesByIds(
      tx,
      tenantId,
      locale,
      matches.map((m) => m.productId),
    ),
  );

  return {
    sessionId,
    matches,
    products: summaries,
    isConfident,
    visualDegraded: visual === null,
  };
}

interface LoadedSession {
  readonly gateResult: GateResult;
  readonly attributes: ExtractedAttributes | null;
  readonly description: string | null;
  readonly imagePublicId: string;
}

async function loadSession(
  tx: RequestTransaction,
  tenantId: string,
  sessionId: string,
): Promise<LoadedSession | null> {
  const rows = await tx.$queryRaw<
    { gate_result: string; extracted_attributes: unknown }[]
  >`
    SELECT gate_result, extracted_attributes
    FROM finder_session
    WHERE tenant_id = ${tenantId}::uuid AND id = ${sessionId}::uuid
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;

  const raw =
    typeof row.extracted_attributes === "object" &&
    row.extracted_attributes !== null
      ? (row.extracted_attributes as Record<string, unknown>)
      : {};

  return {
    gateResult: row.gate_result as GateResult,
    attributes: {
      colorFamily: asNullableString(raw.colorFamily),
      surfaceLook: asNullableString(raw.surfaceLook),
      finish: asNullableString(raw.finish),
      formatGuess: asNullableString(raw.formatGuess),
    },
    description: asNullableString(raw.description),
    imagePublicId: asNullableString(raw.imagePublicId) ?? "",
  };
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** The stored values the grounded explanation is allowed to cite. */
async function loadProductAttributes(
  tx: RequestTransaction,
  tenantId: string,
  productIds: readonly string[],
): Promise<
  Map<
    string,
    {
      colorFamily: string;
      surfaceLook: string;
      finish: string;
      nominalFormat: string | null;
    }
  >
> {
  if (productIds.length === 0) return new Map();

  const rows = await tx.product.findMany({
    where: { tenantId, id: { in: [...productIds] } },
    select: {
      id: true,
      nominalFormat: true,
      colorFamily: { select: { key: true } },
      surfaceLook: { select: { key: true } },
      finish: { select: { key: true } },
    },
  });

  return new Map(
    rows.map((r) => [
      r.id,
      {
        colorFamily: r.colorFamily.key,
        surfaceLook: r.surfaceLook.key,
        finish: r.finish.key,
        nominalFormat: r.nominalFormat,
      },
    ]),
  );
}

/**
 * Persist the ranking.
 *
 * §9.2's own note on why this table exists: "without was_clicked/was_quoted,
 * 'is the tile finder any good?' is unanswerable". Storing the ranking now is
 * what makes the calibration refittable later — `top_score` and
 * `score_distribution` accumulate the query-time distribution that cannot be
 * derived from catalogue photos alone.
 */
async function persistResults(
  tx: RequestTransaction,
  sessionId: string,
  matches: readonly FinderMatch[],
  summary: {
    topScore: number | null;
    band: "strong" | "moderate" | "weak" | "none";
    latencyMs: number;
  },
): Promise<void> {
  await tx.$executeRaw`
    UPDATE finder_session SET
      top_score = ${summary.topScore === null ? null : summary.topScore / 100},
      confidence_band = ${summary.band}::finder_confidence_band,
      result_count = ${matches.length},
      latency_ms = ${summary.latencyMs},
      score_distribution = ${JSON.stringify(matches.map((m) => m.percent))}::jsonb
    WHERE id = ${sessionId}::uuid
  `;

  // Re-running a match for the same session replaces its results rather than
  // appending a second ranking beside the first.
  await tx.$executeRaw`DELETE FROM finder_result WHERE finder_session_id = ${sessionId}::uuid`;

  for (const [index, match] of matches.entries()) {
    await tx.$executeRaw`
      INSERT INTO finder_result (
        id, finder_session_id, product_id, rank,
        calibrated_percent, explanation
      ) VALUES (
        uuid_generate_v7(), ${sessionId}::uuid, ${match.productId}::uuid,
        ${index + 1}, ${match.percent}, ${match.explanation}
      )
    `;
  }
}

export interface StoredFinderSession {
  readonly sessionId: string;
  readonly gate: GateResult;
  readonly attributes: ExtractedAttributes | null;
  readonly imageUrl: string;
  readonly matches: readonly (FinderMatch & { readonly rank: number })[];
  readonly isConfident: boolean;
}

/**
 * Read a persisted session — the shareable `/tile-finder/results/[id]`
 * (§9.2: "id is shareable").
 *
 * No visitor check: the id is a uuid-v7 nobody can guess, the content is the
 * visitor's own photo and a public product ranking, and requiring the
 * original cookie would break the sharing the schema explicitly designed
 * for. Nothing here is another customer's data.
 */
export async function getFinderSession(
  sessionId: string,
): Promise<StoredFinderSession | null> {
  const { tenantId } = await getRequestContext();

  return withRequestContext({ tenantId }, async (tx) => {
    const session = await loadSession(tx, tenantId, sessionId);
    if (!session) return null;

    const rows = await tx.$queryRaw<
      {
        product_id: string;
        rank: number;
        calibrated_percent: string | null;
        explanation: string | null;
      }[]
    >`
      SELECT product_id, rank, calibrated_percent, explanation
      FROM finder_result
      WHERE finder_session_id = ${sessionId}::uuid
      ORDER BY rank ASC
    `;

    const matches = rows.map((r) => {
      const percent =
        r.calibrated_percent === null ? 0 : Number(r.calibrated_percent);
      return {
        productId: r.product_id,
        rank: r.rank,
        percent,
        band: bandForPercent(percent),
        isProvisional: true,
        explanation: r.explanation ?? "",
      };
    });

    const top = matches[0];

    return {
      sessionId,
      gate: session.gateResult,
      attributes: session.attributes,
      imageUrl: mediaUrl({ publicId: session.imagePublicId, secureUrl: null }),
      matches,
      isConfident:
        top !== undefined &&
        isConfidentMatch({
          percent: top.percent,
          band: top.band,
          isProvisional: true,
        }),
    };
  });
}

/**
 * Recover the band from a stored percentage.
 *
 * The live path derives the band from raw DISTANCE, which is the honest
 * signal; only the percentage is persisted. Reading it back therefore has to
 * invert the mapping, and the boundaries below are the percentages the
 * calibration anchors produce at each distance threshold. If those anchors
 * move, this moves with them — which is why `finder_result` also keeps the
 * raw scores, so a re-calibration can rewrite history rather than guess it.
 */
function bandForPercent(percent: number): "strong" | "moderate" | "weak" | "none" {
  if (percent >= 60) return "strong";
  if (percent >= 35) return "moderate";
  if (percent >= 10) return "weak";
  return "none";
}
