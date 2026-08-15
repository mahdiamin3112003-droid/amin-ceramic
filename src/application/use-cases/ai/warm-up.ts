import { warmUpVisualModel } from "@/infrastructure/ai/providers/replicate-visual";

/**
 * Application-layer entry point for the keep-warm cron.
 *
 * Thin by necessity rather than by accident: the route needs exactly one
 * infrastructure capability, and presentation may not reach into
 * infrastructure directly (docs/01 §5.3, enforced by `eslint-plugin-
 * boundaries`). The rule caught this — the route imported the provider and
 * the build refused it.
 *
 * Keeping the seam honest matters here beyond the lint: swapping Replicate
 * for a warm dedicated endpoint is the change the Phase 6 plan expects to
 * make once traffic justifies it, and this is one of the two places that
 * would touch.
 */
export async function warmUpEmbeddingModel(): Promise<{ predictionId: string }> {
  return warmUpVisualModel();
}
