import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import {
  DIAMOND_LEFT_PATH,
  DIAMOND_LEFT_VEINING,
  DIAMOND_RIGHT_PATH,
  DIAMOND_RIGHT_VEINING,
  LOGO_VIEW_BOX,
  MOSAIC_CLIP_PATH,
  MOSAIC_TILES,
  tileFillVar,
} from "@/components/brand/logo-data";

/**
 * The real Amin Ceramic mark — docs/01-architecture.md §11 q7's blocker,
 * resolved: the client supplied the traced vector
 * (`public/brand/amin-ceramic-mark.svg`), transcribed as data in
 * `logo-data.ts`. Static (assembled) render — see
 * `src/components/motion/assembly-intro.tsx` for the animated one-time
 * entrance built from the same data.
 *
 * Renders the diamond + mosaic only, not the source SVG's baked-in
 * wordmark text — the wordmark is set separately as HTML (Marcellus, same
 * as the rest of the site's display type) so it can be localised and
 * doesn't need its own bidi handling embedded in a raster/vector text run.
 *
 * Never mirrors in RTL (docs/01 §3.6): this is brand geometry, not layout.
 */
export function Logo({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      viewBox={LOGO_VIEW_BOX}
      aria-hidden="true"
      focusable="false"
      className={cn("size-8", className)}
      {...props}
    >
      <defs>
        <clipPath id="logo-clip-left">
          <path d={DIAMOND_LEFT_PATH} />
        </clipPath>
        <clipPath id="logo-clip-right">
          <path d={DIAMOND_RIGHT_PATH} />
        </clipPath>
        <clipPath id="logo-clip-mosaic">
          <path d={MOSAIC_CLIP_PATH} />
        </clipPath>
      </defs>

      <path d={DIAMOND_LEFT_PATH} className="fill-navy-700" />
      <g
        clipPath="url(#logo-clip-left)"
        className="stroke-white"
        strokeWidth={0.6}
        strokeLinecap="round"
        fill="none"
        opacity={0.22}
      >
        {DIAMOND_LEFT_VEINING.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>

      <path d={DIAMOND_RIGHT_PATH} className="fill-cyan-400" />
      <g
        clipPath="url(#logo-clip-right)"
        className="stroke-white"
        strokeWidth={0.6}
        strokeLinecap="round"
        fill="none"
        opacity={0.28}
      >
        {DIAMOND_RIGHT_VEINING.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>

      <g clipPath="url(#logo-clip-mosaic)">
        {MOSAIC_TILES.map((tile) => (
          <rect
            key={tile.id}
            x={tile.x}
            y={tile.y}
            width={tile.size}
            height={tile.size}
            style={{ fill: tileFillVar(tile.fill) }}
          />
        ))}
      </g>
    </svg>
  );
}
