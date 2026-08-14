import { calibrateScore, type CalibratedScore } from "./calibration";

/**
 * Reciprocal rank fusion — the domain entity.
 *
 * docs/01-architecture.md §6.3 step 5: visual kNN and semantic kNN each
 * return their own top-60, fused here into one ranking. Pure — no DB, no
 * network (§5.3) — which is what lets this be unit-tested the same way as
 * every other domain module, without pulling in `request-context.ts`'s
 * infrastructure import chain the way the application-layer retrieval
 * use-case necessarily does.
 */

export interface RankedMatch {
  readonly productId: string;
  /** Cosine distance — lower is more similar. */
  readonly distance: number;
}

export interface FusedMatch {
  readonly productId: string;
  /** Reciprocal rank fusion score — higher is more relevant. Not a percentage; see `calibratedScore` for that. */
  readonly fusedScore: number;
  readonly visualDistance: number | null;
  readonly semanticDistance: number | null;
  /** From the visual leg's cosine distance — docs §6.3 step 8 calibrates the CUSTOMER-FACING "how much does this look like the photo" figure, which is a visual-similarity claim. Null when a match came from the semantic leg only. */
  readonly calibratedScore: CalibratedScore | null;
}

/**
 * Standard RRF: score(d) = Σ 1/(k + rank) over every ranked list `d`
 * appears in, 1-indexed rank within each list. A default k=60 is the
 * conventional choice (dampens the influence of rank-1 without a tuned
 * constant) and is not specific to this catalogue's size.
 */
const RRF_K = 60;

export function fuseRankings(
  visual: readonly RankedMatch[],
  semantic: readonly RankedMatch[],
  k: number = RRF_K,
): readonly FusedMatch[] {
  const byProduct = new Map<
    string,
    {
      fused: number;
      visualDistance: number | null;
      semanticDistance: number | null;
    }
  >();

  visual.forEach((match, index) => {
    const entry = byProduct.get(match.productId) ?? {
      fused: 0,
      visualDistance: null,
      semanticDistance: null,
    };
    entry.fused += 1 / (k + index + 1);
    entry.visualDistance = match.distance;
    byProduct.set(match.productId, entry);
  });

  semantic.forEach((match, index) => {
    const entry = byProduct.get(match.productId) ?? {
      fused: 0,
      visualDistance: null,
      semanticDistance: null,
    };
    entry.fused += 1 / (k + index + 1);
    entry.semanticDistance = match.distance;
    byProduct.set(match.productId, entry);
  });

  return Array.from(byProduct.entries())
    .map(([productId, v]) => ({
      productId,
      fusedScore: v.fused,
      visualDistance: v.visualDistance,
      semanticDistance: v.semanticDistance,
      calibratedScore:
        v.visualDistance !== null ? calibrateScore(v.visualDistance) : null,
    }))
    .sort((a, b) => b.fusedScore - a.fusedScore);
}
