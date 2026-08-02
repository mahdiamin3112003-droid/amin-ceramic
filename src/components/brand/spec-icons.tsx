import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Custom spec icons — docs/02-ux-blueprint.md §4.11.
 *
 * "Custom icons drawn to match, all derived from the diamond."
 *
 * Only the two with a Phase 0 consumer are built: both are required by Badge
 * variants in §4.12. The remaining seven (tile format, rectified edge,
 * box/pallet, m² area, lot batch, indoor/outdoor) ship with the catalog
 * components that use them, in Phase 2.
 *
 * Both carry text alongside them everywhere they are used — "colour is never
 * the only signal" and neither is shape (§7.3).
 */

/**
 * Shade variation V1–V4 — "four diamonds of increasing tonal spread" (§4.11).
 *
 * The tonal spread is the information: V1 is four identical tiles, V4 is four
 * visibly different ones. That is exactly what shade variation means to a
 * customer, so the icon teaches the concept rather than merely labelling it.
 */
export function ShadeVariationIcon({
  level,
  className,
  ...props
}: ComponentProps<"svg"> & { level: 1 | 2 | 3 | 4 }) {
  // Opacity spread widens with the grade: V1 uniform, V4 maximally varied.
  const spreads: Record<1 | 2 | 3 | 4, number[]> = {
    1: [1, 1, 1, 1],
    2: [1, 0.85, 1, 0.85],
    3: [1, 0.7, 0.85, 0.55],
    4: [1, 0.55, 0.8, 0.3],
  };
  const opacities = spreads[level];

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <g transform="rotate(45 12 12)">
        {[
          [5, 5],
          [13, 5],
          [5, 13],
          [13, 13],
        ].map(([x, y], i) => (
          <rect
            key={`${String(x)}-${String(y)}`}
            x={x}
            y={y}
            width="6"
            height="6"
            fill="currentColor"
            opacity={opacities[i] ?? 1}
          />
        ))}
      </g>
    </svg>
  );
}

/**
 * Slip rating (DIN 51130 R9–R13) — a diamond on an inclined plane, which is
 * literally how the rating is measured: the ramp angle at which a surface stops
 * being walkable.
 */
export function SlipRatingIcon({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      {/* The ramp */}
      <path
        d="M3 19H21L3 8V19Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* A tile resting on it, rotated to the ramp angle */}
      <rect
        x="11.5"
        y="11.5"
        width="4"
        height="4"
        transform="rotate(-31 13.5 13.5)"
        fill="currentColor"
      />
    </svg>
  );
}
