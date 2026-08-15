/**
 * Score calibration — the domain entity.
 *
 * docs/01-architecture.md §6.3 step 8: "Similarity %: calibrated from cosine
 * distance via a monotonic mapping fitted on a labelled validation set —
 * NOT raw cosine presented as a percentage. Raw cosine shown as '%' is
 * misleading; 0.71 cosine is not '71% match.'"
 *
 * The domain layer imports nothing (§5.3) — pure functions over
 * already-computed distances, no DB, no network.
 *
 * ── What changed, and why the first version was dangerous ──
 * This shipped in Phase 5 as a clamped linear map over [0, 1.2], chosen
 * because cosine distance is theoretically in [0, 2]. Measuring the real
 * embeddings showed that range is nothing like reality. Across all 132 pairs
 * of DIFFERENT products in the catalogue:
 *
 *     closest unrelated pair   0.0882    ← the p01
 *     p05                      0.1128
 *     p10                      0.1456
 *     median                   0.2232
 *     most dissimilar pair     0.4385
 *
 * SigLIP distances between unrelated tiles cluster in 0.09–0.44, nowhere
 * near 1.2. Under the old map those became 93%, 81% and 64% respectively —
 * so the two least similar tiles in the entire catalogue still read as a
 * "64% match", and with a 40% threshold NOTHING was ever rejected. A tile
 * finder that returns a confident wrong answer to every query is worse than
 * one that returns nothing, which is the exact failure §6.3's guardrail
 * exists to prevent.
 *
 * ── Why the anchors below are these numbers ──
 * Each is tied to a measured percentile of the unrelated-pair distribution,
 * which is the empirical noise floor: how close two tiles get by coincidence.
 *   · 0.09 (p01)  — closer than 99% of unrelated pairs. Genuinely unusual.
 *   · 0.15 (~p10) — still notable, but 10% of unrelated pairs reach it.
 *   · 0.22 (p50)  — the median coincidence. Indistinguishable from noise.
 *
 * ── STILL PROVISIONAL, and the reason is not laziness ──
 * Those distances are product-photo → product-photo. A customer's phone
 * snapshot of a tile sits FURTHER from that tile's catalogue photo than the
 * catalogue photo sits from itself — different lighting, angle, crop. So the
 * query-time distribution cannot be derived from this data at all, and
 * calibrating too strictly risks rejecting real matches for tiles actually
 * in stock. `isProvisional: true` stays on every result until real query
 * data accumulates in `finder_session.top_score` / `score_distribution`,
 * which is precisely what those columns are for.
 */

/** §9.2's `finder_confidence_band`. Ordered strongest to weakest. */
export type ConfidenceBand = "strong" | "moderate" | "weak" | "none";

export interface CalibratedScore {
  readonly percent: number;
  readonly band: ConfidenceBand;
  /** Always true today — see the header. Callers should hedge their wording on it. */
  readonly isProvisional: boolean;
}

/**
 * Piecewise-linear anchors, `[distance, percent]`, ascending by distance.
 * Piecewise rather than a fitted curve on purpose: with anchors this sparse
 * a smooth curve would imply precision the data does not support, and every
 * breakpoint here can be traced to a measured percentile.
 */
const ANCHORS: readonly (readonly [number, number])[] = [
  [0.0, 100],
  [0.09, 60], // p01 of unrelated pairs
  [0.15, 35], // ~p10
  [0.22, 10], // median — coincidence territory
  [0.35, 0], // beyond the p75 of unrelated; no signal left
];

/**
 * Band thresholds, by DISTANCE rather than by percent.
 *
 * Distance is the measured quantity; the percentage is a presentation of it.
 * Deriving the band from the raw signal means re-tuning the display mapping
 * later cannot silently move the guardrail.
 */
const STRONG_MAX_DISTANCE = 0.09;
const MODERATE_MAX_DISTANCE = 0.15;
const WEAK_MAX_DISTANCE = 0.22;

function bandFor(distance: number): ConfidenceBand {
  if (distance <= STRONG_MAX_DISTANCE) return "strong";
  if (distance <= MODERATE_MAX_DISTANCE) return "moderate";
  if (distance <= WEAK_MAX_DISTANCE) return "weak";
  return "none";
}

/**
 * Cosine distance → a calibrated similarity percentage and confidence band.
 *
 * Monotonic non-increasing: a closer distance never scores lower.
 *
 * @throws {RangeError} if distance is negative.
 */
export function calibrateScore(distance: number): CalibratedScore {
  if (distance < 0) {
    throw new RangeError(`distance must not be negative, got ${String(distance)}`);
  }

  const percent = Math.round(interpolate(distance));
  return { percent, band: bandFor(distance), isProvisional: true };
}

function interpolate(distance: number): number {
  const first = ANCHORS[0];
  const last = ANCHORS[ANCHORS.length - 1];
  // `noUncheckedIndexedAccess` — ANCHORS is a non-empty literal, but the
  // compiler cannot know that, and a runtime guard beats a non-null assertion.
  if (!first || !last) return 0;

  if (distance <= first[0]) return first[1];
  if (distance >= last[0]) return last[1];

  for (let i = 1; i < ANCHORS.length; i++) {
    const lo = ANCHORS[i - 1];
    const hi = ANCHORS[i];
    if (!lo || !hi) continue;
    if (distance <= hi[0]) {
      const span = hi[0] - lo[0];
      const ratio = span === 0 ? 0 : (distance - lo[0]) / span;
      return lo[1] + ratio * (hi[1] - lo[1]);
    }
  }
  return last[1];
}

/**
 * The §6.3 guardrail: "if the top result's calibrated score is below
 * threshold, the UI says so plainly and offers the assistant instead."
 *
 * Expressed as a band, not a percent, for the reason given above. `weak` is
 * deliberately NOT confident: at the current catalogue size a weak match is
 * usually the nearest of twelve unrelated tiles rather than a real answer,
 * and docs/02 §3.4's STATE 4 is designed for exactly that. A false "no
 * match" costs a click to the assistant; a false confident match costs
 * trust in the whole feature.
 */
export function isConfidentMatch(score: CalibratedScore): boolean {
  return score.band === "strong" || score.band === "moderate";
}
