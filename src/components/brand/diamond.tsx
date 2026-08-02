import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Logo-derived geometry — docs/01-architecture.md §2.2 and §3.1.
 *
 * "Every structural device on the site — section markers, hover states, loading
 *  indicators, the scroll progress indicator — should derive from a 45° square,
 *  not from generic circles or bars."
 *
 * IMPORTANT: this is *derived* geometry, not the logo. The mark itself (the
 * two-tone crackle-veined rhombus with the mosaic centre and the small-cap
 * wordmark) is never redrawn or altered — it ships as the client's own vector,
 * which is still outstanding (docs/01-architecture.md §11 q7). Until it arrives
 * there is deliberately no `<Logo>` component: an approximation of a real
 * company's mark is worse than its absence.
 *
 * The diamond does NOT mirror in RTL. Layout mirrors; brand geometry does not
 * (§3.6). Because this is a rotation rather than a directional property, that
 * falls out for free.
 */

type DiamondProps = ComponentProps<"svg"> & {
  /** Filled reads as a solid tile; outline as a section marker or indicator. */
  variant?: "filled" | "outline";
};

export function Diamond({ className, variant = "filled", ...props }: DiamondProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <rect
        x="4.222"
        y="4.222"
        width="15.556"
        height="15.556"
        transform="rotate(45 12 12)"
        {...(variant === "filled"
          ? { fill: "currentColor" }
          : { stroke: "currentColor", strokeWidth: 1.5 })}
      />
    </svg>
  );
}

/**
 * Button loading state — docs/02-ux-blueprint.md §4.7.
 *
 * "A 16px diamond spinner replaces the leading icon slot, width does not
 *  change (prevents layout shift and accidental double-clicks)."
 *
 * Rotation, not a bouncing pulse: tile is heavy (§5.1 principle 1). Under
 * prefers-reduced-motion the global rule in globals.css freezes the animation
 * and the accompanying `aria-live` text carries the meaning instead.
 */
export function DiamondSpinner({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn("size-4 shrink-0 animate-spin", className)}
      style={{ animationDuration: "1.2s" }}
      {...props}
    >
      <rect
        x="4.222"
        y="4.222"
        width="15.556"
        height="15.556"
        transform="rotate(45 12 12)"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
        strokeDasharray="20 42"
      />
    </svg>
  );
}
