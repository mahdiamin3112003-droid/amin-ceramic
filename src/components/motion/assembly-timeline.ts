import { MOSAIC_TILES } from "@/components/brand/logo-data";

/**
 * The Assembly intro's geometry and clock — docs/01-architecture.md §4.2,
 * docs/02-ux-blueprint.md §5.2.
 *
 * Kept out of the component because it is pure maths over the logo data:
 * where each fragment starts, the curve it travels, and when. Extracting it
 * means the timeline can be reasoned about (and adjusted) without reading
 * through rAF and canvas plumbing.
 */

/**
 * Marks (ms). docs/01 §4.2's table, plus a short hold before the flip so
 * the finished mark visibly RESOLVES before it leaves — without that beat
 * the docking reads as an interruption rather than a hand-off.
 *
 * Travel window is the docs' 0.4–2.6s: last delay is
 * `travelStart + stagger` (1700), longest flight `travel + 120` jitter
 * (900) → final seat at 2600 exactly.
 */
export const T = {
  /** The held breath before anything moves. */
  silence: 260,
  travelStart: 260,
  /** Widest stagger — the spec's `{amount, from: random}`. */
  stagger: 1000,
  travel: 780,
  /** Centre mosaic seats and "clicks" while outer tiles are still arriving. */
  click: 1360,
  /** Assembly complete — ~2.0s of build, inside the 3–4s whole-sequence brief. */
  fragmentsSeated: 2040,
  trailsGone: 2260,
  /** The light sweep across the finished mark, once it is whole. */
  shineStart: 2100,
  shineEnd: 2760,
  wordmarkStart: 2400,
  wordmarkEnd: 2900,
  /** The pause. A near-full second of the finished lock-up standing still —
      the beat that makes the assembly RESOLVE before it departs. */
  holdStart: 2900,
  holdEnd: 3800,
  /** The FLIP: shrink and travel into the navbar slot. Deliberately long
      (1.1s) and eased at both ends so it reads as a considered descent
      rather than a snap. Overridden to 400ms by skip. */
  flipStart: 3800,
  flipEnd: 4900,
  /** Buffer after landing: the navbar mark is revealed beneath the
      pixel-aligned intro mark at flipEnd, then the overlay unmounts here.
      Longer than strictly needed so the ground's dissolve completes into
      the homepage rather than being cut short by the unmount. */
  end: 5100,
} as const;

/** The mark's centre in logo-data user units — every path is laid out around it. */
export const MARK_CENTRE = { x: 200, y: 161 } as const;

export interface Fragment {
  readonly id: string;
  /** `tile` renders as a mosaic <rect>; `half` is one of the two veined triangle groups. */
  readonly kind: "tile" | "half";
  /** Final resting position (user units; top-left for tiles, 0,0 for halves — their geometry is already in place). */
  readonly x: number;
  readonly y: number;
  /**
   * Rotation/scale pivot at REST (user units): tile centre, or the half's
   * centroid. The per-frame pivot is this plus the current travel delta, so
   * fragments spin about themselves while flying.
   */
  readonly pivotX: number;
  readonly pivotY: number;
  /** Scattered off-screen origin. */
  readonly fromX: number;
  readonly fromY: number;
  /** Quadratic-bezier control point — what makes the path an arc, not a line. */
  readonly ctrlX: number;
  readonly ctrlY: number;
  readonly startRotation: number;
  readonly delay: number;
  readonly duration: number;
  /** Trails are drawn for mosaic tiles only; the two halves are too large to read as sparks. */
  readonly trail: boolean;
  /**
   * `false` on small viewports for half the tiles (docs' mobile fragment
   * reduction): the fragment does not fly — it fades in AT its exact final
   * position at the moment it would have arrived, so the finished mosaic is
   * always complete and identical to desktop.
   */
  readonly fly: boolean;
}

/** Deterministic PRNG — the scatter must be identical across re-renders, so `Math.random` is out. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Triangle centroids of the two halves — their rotation pivots in flight. */
const HALF_LEFT_PIVOT = { x: (200 + 114 + 200) / 3, y: (95 + 161 + 227) / 3 };
const HALF_RIGHT_PIVOT = { x: (200 + 286 + 200) / 3, y: (95 + 161 + 227) / 3 };

/**
 * All 38 fragments — 36 mosaic tiles plus the two veined triangle halves —
 * ordered so the CENTRE SEATS FIRST (docs: "centre mosaic squares land
 * first and click") while the OUTER EDGE LEAVES FIRST (docs: "ordered from
 * the mark's outer edge inward"). Both hold at once because delay is keyed
 * to distance from centre: far fragments start early and travel far, near
 * ones start late and arrive sooner. The halves are the outermost material,
 * so they launch first and are seated before the mosaic finishes landing on
 * them.
 *
 * `reduced` (small viewports): every second tile keeps `fly: false` and
 * fades in at its final position on its arrival beat instead — 20 flown
 * fragments instead of 38, same finished mark.
 */
export function buildFragments(reduced = false): readonly Fragment[] {
  const rand = mulberry32(20260803);

  const tiles = MOSAIC_TILES.map((tile) => {
    const cx = tile.x + tile.size / 2;
    const cy = tile.y + tile.size / 2;
    const dx = cx - MARK_CENTRE.x;
    const dy = cy - MARK_CENTRE.y;
    const dist = Math.hypot(dx, dy);
    return { tile, cx, cy, dx, dy, dist };
  });

  const maxDist = Math.max(...tiles.map((t) => t.dist)) || 1;

  const tileFragments = tiles.map(({ tile, cx, cy, dx, dy, dist }, index) => {
    // Fly in along each tile's own outward bearing, thrown well past the
    // viewBox so nothing is visible at t=0.
    // Thrown far — 620–1180 user units against a 240-unit viewBox, so every
    // fragment starts several screens out and arrives with real distance
    // behind it. A short throw reads as a fade-in; a long one reads as
    // material being gathered.
    const angle = Math.atan2(dy, dx) + (rand() - 0.5) * 1.35;
    const throwDistance = 620 + rand() * 560;

    const fromX = tile.x + Math.cos(angle) * throwDistance;
    const fromY = tile.y + Math.sin(angle) * throwDistance;

    // Bow the path perpendicular to travel — a straight line reads as
    // mechanical, an arc reads as thrown.
    const midX = (fromX + tile.x) / 2;
    const midY = (fromY + tile.y) / 2;
    const perpX = -(tile.y - fromY);
    const perpY = tile.x - fromX;
    const perpLen = Math.hypot(perpX, perpY) || 1;
    // Deeper bow to match the longer throw — the arc has to stay legible
    // across a much greater distance or the path flattens into a line.
    const bow = (rand() - 0.5) * 420;

    // Near-centre tiles get the SHORTEST delay, so they seat first.
    const nearness = dist / maxDist;
    const delay =
      T.travelStart + nearness * T.stagger * 0.72 + rand() * T.stagger * 0.28;

    return {
      id: tile.id,
      kind: "tile" as const,
      x: tile.x,
      y: tile.y,
      pivotX: cx,
      pivotY: cy,
      fromX,
      fromY,
      ctrlX: midX + (perpX / perpLen) * bow,
      ctrlY: midY + (perpY / perpLen) * bow,
      startRotation: (rand() - 0.5) * 220,
      delay,
      duration: T.travel + rand() * 120,
      trail: true,
      fly: !reduced || index % 2 === 0,
    } satisfies Fragment;
  });

  // The halves travel in DELTA space: their geometry already sits at its
  // final position in the SVG, so x/y (rest) is 0,0 and from/ctrl are
  // offsets from rest.
  const half = (
    id: string,
    pivot: { x: number; y: number },
    side: 1 | -1,
  ): Fragment => {
    const fromX = side * (760 + rand() * 180);
    const fromY = -(240 + rand() * 120);
    return {
      id,
      kind: "half",
      x: 0,
      y: 0,
      pivotX: pivot.x,
      pivotY: pivot.y,
      fromX,
      fromY,
      ctrlX: fromX * 0.45 + side * 40,
      ctrlY: fromY * 0.45 - 50,
      startRotation: side * (14 + rand() * 10),
      delay: T.travelStart + rand() * 140,
      duration: T.travel + 260,
      trail: false,
      fly: true,
    };
  };

  return [
    ...tileFragments,
    half("half-left", HALF_LEFT_PIVOT, -1),
    half("half-right", HALF_RIGHT_PIVOT, 1),
  ];
}

/** `ease-material` — the house curve, cubic-bezier(.32,.72,0,1), solved numerically. */
export function easeMaterial(t: number): number {
  return cubicBezier(0.32, 0.72, 0, 1, t);
}

/** `ease-in-out-quart` — used for the shine and wordmark wipes. */
export function easeInOutQuart(t: number): number {
  return cubicBezier(0.76, 0, 0.24, 1, t);
}

function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x: number,
): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const bezier = (a: number, b: number, t: number) => {
    const u = 1 - t;
    return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
  };

  // Newton-Raphson against the x-curve, then read y. Eight passes is well
  // past visual convergence at 60fps.
  let t = x;
  for (let i = 0; i < 8; i++) {
    const xEst = bezier(x1, x2, t);
    const d =
      3 * (1 - t) * (1 - t) * x1 +
      6 * (1 - t) * t * (x2 - x1) +
      3 * t * t * (1 - x2);
    if (Math.abs(d) < 1e-6) break;
    t -= (xEst - x) / d;
    t = Math.min(1, Math.max(0, t));
  }
  return bezier(y1, y2, t);
}

/** Point on the fragment's quadratic bezier at eased progress `p`. */
export function pointAt(f: Fragment, p: number): { x: number; y: number } {
  const u = 1 - p;
  return {
    x: u * u * f.fromX + 2 * u * p * f.ctrlX + p * p * f.x,
    y: u * u * f.fromY + 2 * u * p * f.ctrlY + p * p * f.y,
  };
}

/** 0→1 eased progress for one fragment at absolute time `now` (ms since start). */
export function progressOf(f: Fragment, now: number): number {
  return easeMaterial(Math.min(1, Math.max(0, (now - f.delay) / f.duration)));
}
