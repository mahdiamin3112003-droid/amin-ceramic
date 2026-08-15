import type { NextRequest } from "next/server";

import { warmUpEmbeddingModel } from "@/application/use-cases/ai/warm-up";

/**
 * Keeps the Replicate SigLIP model warm — the Phase 6 plan's approved
 * mitigation for cold start.
 *
 * ── Why this exists ──
 * Measured over real embedding calls: min 1.6s, median 9.1s, p90 212s, and a
 * cold call clocked at 234,855 ms. Replicate scales a model to zero after
 * inactivity, so a LOW-traffic feature meets a cold model most of the time —
 * cold starts are the norm here, not the tail. No visitor absorbs four
 * minutes, and no serverless function survives it either.
 *
 * A ping every 10 minutes holds an instance up, pulling real queries toward
 * the 1.6s floor. It does not eliminate the risk — Replicate may still evict
 * between ticks — which is why the query path degrades honestly rather than
 * assuming warmth.
 *
 * ── Why it does not wait, and why that is not laziness ──
 * The cold start is longer than the function is allowed to live, so a
 * blocking warm-up would be killed in exactly the case it was needed. This
 * queues the prediction and returns; Replicate runs it server-side whether
 * or not anyone is listening. See `warmUpVisualModel`.
 *
 * ── Why no ai_interaction row ──
 * That table records completed calls with their token counts, latency and
 * status. This request never learns any of those — it only knows the
 * prediction was accepted. Writing a row with invented zeroes would corrupt
 * the cost attribution §6.6 exists to provide. The spend is visible in
 * Replicate's own dashboard, which is where an unattributed scheduled job
 * belongs.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<Response> {
  /**
   * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Checked first:
   * this route spends money, so an anonymous caller must not be able to
   * drive it by finding the URL.
   *
   * Fails closed when the secret is unset — an absent secret means the check
   * cannot be performed, not that it passes.
   */
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }

  try {
    const { predictionId } = await warmUpEmbeddingModel();
    return Response.json({ ok: true, predictionId });
  } catch (cause) {
    // Message only, never the error object: provider SDKs attach the
    // originating request, and Replicate's carries the Authorization header.
    // That leak already happened once — see `replicate-visual.ts`.
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error("[cron] keep-warm failed:", message);

    // 200, not 500. A missed warm-up degrades latency on the next query at
    // worst and self-corrects on the following tick; making Vercel's cron
    // monitor red for that would train everyone to ignore it.
    return Response.json({ ok: false, error: message });
  }
}
