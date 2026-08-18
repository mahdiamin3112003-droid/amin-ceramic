/**
 * Feature flags for work that is built but not yet cleared for customers.
 *
 * ── Why these fail CLOSED ──
 * Every flag here is OFF unless explicitly switched on. An unset variable
 * means disabled, never "probably fine" — the same posture as
 * `prisma/guard-destructive.ts`, and for the same reason: the cost of a
 * wrong default is paid by someone who did not choose it.
 *
 * Today the Tile Finder happens to be absent from production only because
 * the last deploy predates the code. That is not a safety property, it is
 * an accident of timing that the next `vercel --prod` erases. A flag is the
 * version of "not live yet" that survives a deploy.
 *
 * Server-only by construction: no `NEXT_PUBLIC_` prefix, so the value never
 * reaches the browser and a visitor cannot flip it.
 */

function isEnabled(name: string): boolean {
  // Exactly "true". Not "1", not "yes", not "TRUE " with a stray space —
  // an ambiguous value is a misconfiguration, and the safe reading of a
  // misconfiguration is off.
  return process.env[name] === "true";
}

/**
 * The AI Tile Finder — `/[locale]/tile-finder` and `/api/ai/tile-finder/*`.
 *
 * Held back deliberately while two things are unproven: the Replicate
 * keep-warm cron is not yet deployed, so a real visitor's first search
 * would take the 2-4 minute cold path measured during development; and the
 * Gemini key is still free-tier at 20 requests/day/model, roughly ten
 * searches before the feature starts failing for everyone.
 *
 * Set `TILE_FINDER_ENABLED=true` once both are resolved AND the owner has
 * approved going live.
 */
export function isTileFinderEnabled(): boolean {
  return isEnabled("TILE_FINDER_ENABLED");
}
