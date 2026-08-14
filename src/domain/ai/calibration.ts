/**
 * Score calibration — the domain entity.
 *
 * docs/01-architecture.md §6.3 step 8: "Similarity %: calibrated from cosine
 * distance via a monotonic mapping fitted on a labelled validation set —
 * NOT raw cosine presented as a percentage. Raw cosine shown as '%' is
 * misleading; 0.71 cosine is not '71% match.'"
 *
 * docs/01 imports nothing (§5.3) — pure functions over already-computed
 * distances, no DB, no network.
 *
 * ── This mapping is PROVISIONAL ──
 * A real calibration curve is fitted on labelled query→correct-match pairs
 * spanning the range of "clearly right" to "clearly wrong" matches. At 12
 * products, with exactly one genuine near-duplicate pair (Cefeo Perla Matte
 * / Crotone Pearl Matte) and no negative examples curated at all, there is
 * not enough labelled data to fit a curve that means anything beyond this
 * catalogue's 12 rows. Fitting one anyway would produce a number that reads
 * as precise and isn't — exactly what step 8 exists to prevent, just one
 * level up.
 *
 * So this ships as an explicit, honest placeholder: a clamped linear map
 * from cosine distance to a percentage, monotonic (satisfies the interface
 * every caller needs), but not fitted on evidence. `isProvisional: true` on
 * every result is not decoration — it is what lets a caller (the eval
 * harness, and eventually the Tile Finder UI) choose to show a real user a
 * looser, hedged message ("possible match") rather than a confident "94%
 * match" backed by nothing. Refit with `fitCalibrationCurve` once there are
 * enough labelled pairs to make that meaningful — a data change to this
 * file, not a rewrite of anything that calls it.
 */

export interface CalibratedScore {
  readonly percent: number;
  readonly isProvisional: boolean;
}

/** Cosine distance is in [0, 2]; treat anything past 1.2 as "no meaningful similarity" rather than extrapolating. */
const DISTANCE_FLOOR_FOR_ZERO_PERCENT = 1.2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Cosine distance → a calibrated similarity percentage.
 *
 * @throws {RangeError} if distance is negative.
 */
export function calibrateScore(distance: number): CalibratedScore {
  if (distance < 0) {
    throw new RangeError(`distance must not be negative, got ${String(distance)}`);
  }

  const normalised = clamp(distance / DISTANCE_FLOOR_FOR_ZERO_PERCENT, 0, 1);
  const percent = Math.round((1 - normalised) * 100);

  return { percent, isProvisional: true };
}

/**
 * A calibrated score below this is treated as "no confident match" —
 * docs/01 §6.3's guardrail: "if the top result's calibrated score is below
 * threshold, the UI says so plainly and offers the assistant instead."
 * Deliberately conservative while the mapping above is provisional — a
 * false "no match" costs a click to the assistant; a false confident match
 * costs the customer's trust in the whole feature.
 */
export const MINIMUM_CONFIDENT_MATCH_PERCENT = 40;

export function isConfidentMatch(score: CalibratedScore): boolean {
  return score.percent >= MINIMUM_CONFIDENT_MATCH_PERCENT;
}
