import { cn } from "@/lib/utils";

/**
 * A wall of large-format tiles that lays itself on load.
 *
 * WHY THIS EXISTS. The auth screens first used `MarbleSurface`, the
 * homepage hero's procedural slab. Cropped into a tall narrow column it is
 * scaled about 4.5x, which stretches its fine dendritic veining into soft
 * billows — the surface stopped reading as stone and started reading as
 * sky. For a company that sells tile, a background that looks like weather
 * is the wrong first impression, and no amount of opacity tuning fixes a
 * scale problem.
 *
 * So this draws the product instead of a texture of it: real tiles, real
 * grout joints, laid in running bond the way large format actually goes on
 * a wall. Every tile is an element, which is what lets the wall ASSEMBLE —
 * the same idea as the Assembly intro, and the reason the surface is worth
 * animating at all.
 *
 * ── Proportion is fixed, the row count is not ──
 * Tiles are sized by `aspect-ratio`, never by dividing the panel into a
 * fixed grid. The first version used 4 columns x 7 rows regardless of the
 * container, which on a short wide band produced 8:1 slivers — subway
 * brick, which is exactly the cheap read this is meant to avoid. Here the
 * columns set the width and 1:2 sets the height, so a tile is always a
 * plausible 60x120 whatever the panel does. Extra rows simply overflow and
 * clip, which is more convincing anyway: a real wall continues past the
 * frame.
 *
 * ── Determinism ──
 * Per-tile variation comes from an integer hash of the tile's index, never
 * `Math.random()`. This renders on the server; a random value would differ
 * on the client and cause a hydration mismatch. The spread is kept narrow
 * on purpose — tile from one batch varies subtly, and a wide spread reads
 * as a broken gradient rather than as stone.
 *
 * ── Motion ──
 * Tiles stagger along the 45 degree brand axis (`row + col`), so the wall
 * lays diagonally rather than in rows. One raking highlight crosses when it
 * is done. After that a single slow bloom breathes, and nothing else moves.
 * All CSS: no JavaScript, no hydration cost, and the global reduced-motion
 * rule collapses it straight to the finished state.
 */

const COLUMNS = 3;
/** Enough to overflow the tallest realistic panel; the excess is clipped. */
const ROWS = 9;

/** Deterministic 0–1 from an index. Cheap integer hash, stable across renders. */
function jitter(index: number, salt: number): number {
  const h = Math.imul(index + salt * 0x9e37, 0x85eb) ^ (index >>> 3);
  return ((h >>> 8) & 0xffff) / 0xffff;
}

export function TileWall({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("absolute inset-0 overflow-hidden bg-navy-950", className)}
    >
      {/* Oversized and pulled back so the running-bond offset never exposes
          an edge, and so the wall reads as continuing past the frame. */}
      <div
        className="absolute -top-[6%] flex flex-col gap-[3px]"
        // No Tailwind utility for a NEGATIVE logical inline inset, so the
        // bleed is set directly on the logical property rather than reaching
        // for `-inset-x-*`, which would flip wrong in RTL.
        style={{ insetInline: "-18%" }}
      >
        {Array.from({ length: ROWS }, (_, row) => (
          <div
            key={row}
            className="flex gap-[3px]"
            // Half-tile offset on odd rows — how large format is actually laid.
            style={{ marginInlineStart: row % 2 === 1 ? "-16%" : "0" }}
          >
            {Array.from({ length: COLUMNS + 1 }, (_, col) => {
              const i = row * (COLUMNS + 1) + col;

              // Raised from 0.05–0.18: the first pass was so dark the wall
              // read as a black rectangle and the tile joints disappeared.
              const tone = 0.12 + jitter(i, 1) * 0.2;
              const sheen = 0.07 + jitter(i, 2) * 0.13;
              const delayMs = (row + col) * 90 + jitter(i, 3) * 70;

              return (
                <div
                  key={col}
                  className="relative overflow-hidden rounded-[2px]"
                  style={{
                    // Width from the column count, height from the tile's own
                    // proportion. This is what keeps it 60x120 at any size.
                    inlineSize: `${String(100 / COLUMNS)}%`,
                    aspectRatio: "2 / 1",
                    // The literal is an ALPHA, not a colour — the colours are
                    // `--color-cyan-100` and `--color-navy-900` from tokens.
                    backgroundColor: `color-mix(in oklab, var(--color-cyan-100) ${String(
                      Math.round(tone * 100),
                    )}%, var(--color-navy-900))`,
                    animation:
                      "tile-set var(--duration-slow) var(--ease-material) both",
                    animationDelay: `${String(Math.round(delayMs))}ms`,
                  }}
                >
                  {/* The glaze catching light across the tile's own face —
                      what stops a flat rectangle reading as paper. */}
                  <div
                    className="absolute inset-0"
                    style={{
                      // Tokens, not literals: the highlight is `--color-white`
                      // and the falloff is `--color-navy-950`, both mixed down
                      // to the per-tile alpha.
                      backgroundImage: `linear-gradient(135deg, color-mix(in oklab, var(--color-white) ${String(
                        Math.round(sheen * 100),
                      )}%, transparent) 0%, transparent 46%, transparent 56%, color-mix(in oklab, var(--color-navy-950) 42%, transparent) 100%)`,
                    }}
                  />
                  {/* A hairline bevel on the leading edges — the chamfer on a
                      rectified tile, and the detail that sells it as ceramic
                      rather than as a coloured box. */}
                  <div className="absolute inset-0 border-s border-t border-white/6" />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* The raking highlight, once, after the wall is laid. */}
      <div
        className="pointer-events-none absolute inset-y-0 opacity-0"
        style={{
          insetInline: "-33%",
          backgroundImage:
            "linear-gradient(100deg, transparent 0%, color-mix(in oklab, var(--color-cyan-400) 24%, transparent) 46%, color-mix(in oklab, var(--color-white) 18%, transparent) 52%, transparent 100%)",
          animation: "wall-sweep 1900ms var(--ease-material) 1500ms both",
        }}
      />

      {/* Key light, off the top-inline-end corner. Breathes on a 22s cycle —
          slow enough that you never catch it moving, only notice the room is
          not static. */}
      <div
        className="pointer-events-none absolute -end-1/4 -top-1/4 size-[85%] rounded-full bg-cyan-400/40 blur-3xl"
        style={{ animation: "wall-breathe 22s var(--ease-material) 2.4s infinite" }}
      />

      {/* A cooler counter-light low on the inline-start side. Two sources
          rather than one is what stops a large flat surface reading as a
          gradient — real rooms are never lit from a single point. Its cycle
          is deliberately coprime with the key light's, so the pair never
          settles into a visible rhythm. */}
      <div
        className="pointer-events-none absolute -start-1/4 -bottom-1/4 size-[75%] rounded-full bg-blue-500/32 blur-3xl"
        style={{ animation: "wall-drift 31s var(--ease-material) 1.8s infinite" }}
      />

      {/* A reflection crossing the glaze roughly every 26 seconds. The long
          dead time between passes is what keeps it feeling like light rather
          than like a progress indicator. */}
      <div
        className="pointer-events-none absolute inset-y-0 w-1/3"
        style={{
          backgroundImage:
            "linear-gradient(105deg, transparent 0%, color-mix(in oklab, var(--color-white) 9%, transparent) 45%, color-mix(in oklab, var(--color-cyan-100) 14%, transparent) 55%, transparent 100%)",
          animation: "surface-reflection 26s var(--ease-material) 6s infinite",
        }}
      />

      {/* Depth, and a guaranteed bed for overlaid copy regardless of which
          tiles happened to land light. */}
      <div className="pointer-events-none absolute start-0 end-0 bottom-0 h-2/5 bg-linear-to-t from-navy-950/85 via-navy-950/45 to-transparent" />
      <div className="pointer-events-none absolute start-0 end-0 top-0 h-1/3 bg-linear-to-b from-navy-950/55 to-transparent" />

      {/* Film grain.
          An inline SVG feTurbulence rather than an image: no request, no
          cache entry, and it scales to any viewport. At 3.5% it is invisible
          as texture and only does the one job worth doing — breaking up the
          smooth gradients above so large flat areas of navy stop banding on
          8-bit displays. */}
      <div
        className="pointer-events-none absolute -inset-[3%] opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")",
          animation: "grain-shift 900ms steps(1, end) infinite",
        }}
      />
    </div>
  );
}
