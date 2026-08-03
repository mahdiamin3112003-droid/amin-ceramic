import { cn } from "@/lib/utils";

/**
 * Procedural marble — the hero's full-bleed surface.
 *
 * There is no photography in this project yet, and a ceramic brand's hero
 * cannot be a flat colour. Rather than hold the homepage hostage to an
 * asset that doesn't exist, this generates a large-format marble slab in
 * the browser: `feTurbulence` fractal noise, pushed through a displacement
 * map and a steep colour-transfer curve, produces the fine dendritic
 * veining of a Calacatta-family stone. It is the same material the catalog
 * sells, which is the point — the hero IS a tile surface, not a picture of
 * one.
 *
 * When real art direction lands, this component is what gets swapped; the
 * hero's layout, type and motion do not change.
 *
 * Everything here is a static filter render. Nothing animates inside the
 * filter (re-rasterising turbulence per frame is ruinous); the drift is a
 * GPU-composited CSS transform on the wrapper, applied by the caller.
 */
export function MarbleSurface({
  className,
  seed = 7,
  veinOpacity = 0.72,
}: {
  className?: string;
  /** Changes the vein pattern without changing its character. */
  seed?: number;
  veinOpacity?: number;
}) {
  const filterId = `marble-${String(seed)}`;

  return (
    <svg
      className={cn("size-full", className)}
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* The slab's own colour — deep navy with a warmer core, so the
            surface reads as lit rather than flat. */}
        <linearGradient id={`${filterId}-base`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-navy-950)" />
          <stop offset="45%" stopColor="var(--color-navy-900)" />
          <stop offset="78%" stopColor="var(--color-navy-700)" />
          <stop offset="100%" stopColor="var(--color-navy-950)" />
        </linearGradient>

        {/* A cool rake of light across the 45° brand axis. */}
        <linearGradient
          id={`${filterId}-sheen`}
          x1="0%"
          y1="100%"
          x2="100%"
          y2="0%"
        >
          <stop offset="0%" stopColor="var(--color-cyan-400)" stopOpacity="0" />
          <stop offset="52%" stopColor="var(--color-cyan-400)" stopOpacity="0.16" />
          <stop offset="100%" stopColor="var(--color-cyan-400)" stopOpacity="0" />
        </linearGradient>

        <radialGradient id={`${filterId}-vignette`} cx="50%" cy="42%" r="78%">
          <stop offset="55%" stopColor="var(--color-navy-950)" stopOpacity="0" />
          <stop
            offset="100%"
            stopColor="var(--color-navy-950)"
            stopOpacity="0.72"
          />
        </radialGradient>

        {/* The veins. fractalNoise gives the branching structure; the steep
            alpha bias crushes it into thin bright filaments instead of a
            soft cloud, which is what separates marble from fog.
            `feDisplacementMap` folding the noise against itself is what
            makes the filaments wander and fork like real crystalline
            veining rather than drift in parallel. */}
        <filter id={filterId} x="-12%" y="-12%" width="124%" height="124%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.009 0.021"
            numOctaves={6}
            seed={seed}
            result="noise"
          />
          <feDisplacementMap in="noise" in2="noise" scale={64} result="warped" />
          <feColorMatrix
            in="warped"
            type="matrix"
            values="0 0 0 0 0.82
                    0 0 0 0 0.91
                    0 0 0 0 0.97
                    1.7 0 0 0 -0.62"
            result="veins"
          />
          <feGaussianBlur in="veins" stdDeviation="0.35" />
        </filter>

        {/* Large-format tile seams. The hero is not a picture of a wall —
            it IS one, so the surface is divided into 60×120-proportioned
            slabs by hairline grout joints on the brand's 45° axis. This is
            the detail that makes the hero read as ceramic rather than as a
            generic dark gradient. */}
        <pattern
          id={`${filterId}-seams`}
          width="300"
          height="150"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-12)"
        >
          <rect width="300" height="150" fill="none" />
          <path
            d="M0,0 H300 M0,150 H300 M0,0 V150 M150,0 V150"
            stroke="var(--color-cyan-400)"
            strokeWidth="0.85"
            opacity="0.13"
            fill="none"
          />
        </pattern>

        {/* A second, coarser pass — the wide "ghost" veining that sits under
            the fine filaments and gives the slab depth. */}
        <filter
          id={`${filterId}-deep`}
          x="-12%"
          y="-12%"
          width="124%"
          height="124%"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.004 0.009"
            numOctaves={3}
            seed={seed + 11}
            result="noise"
          />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0.37
                    0 0 0 0 0.77
                    0 0 0 0 0.89
                    1 0 0 0 -0.52"
          />
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>

      <rect width="1200" height="800" fill={`url(#${filterId}-base)`} />
      <rect
        width="1200"
        height="800"
        filter={`url(#${filterId}-deep)`}
        opacity={0.6}
      />
      <rect
        width="1200"
        height="800"
        filter={`url(#${filterId})`}
        opacity={veinOpacity}
      />
      <rect width="1200" height="800" fill={`url(#${filterId}-seams)`} />
      <rect width="1200" height="800" fill={`url(#${filterId}-sheen)`} />
      <rect width="1200" height="800" fill={`url(#${filterId}-vignette)`} />
    </svg>
  );
}
