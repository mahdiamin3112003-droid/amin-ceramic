import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Skeleton — docs/02-ux-blueprint.md §4.16.
 *
 * "stone-100 base with a 1.4s shimmer sweeping at 45° along the brand axis.
 *  Reduced motion: static stone-100, no shimmer."
 *
 * Not `animate-pulse`: a pulse is a generic loading tic, whereas the 45° sweep
 * is the brand's motion axis and matches the shine in the intro sequence (§5.2).
 *
 * `data-skeleton` is what the global reduced-motion rule in globals.css targets
 * to strip the gradient — handling it there rather than here is why §5.12 can
 * say reduced motion is honoured "globally, not per-component".
 *
 * The caller supplies the dimensions, deliberately: "Skeletons match the final
 * layout exactly — mismatched skeletons cause perceived layout shift even when
 * CLS is technically zero."
 */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      data-skeleton=""
      aria-hidden="true"
      className={cn(
        "rounded-md bg-stone-100",
        "animate-shimmer bg-[length:200%_100%]",
        "bg-[linear-gradient(115deg,var(--color-stone-100)_35%,var(--color-white)_50%,var(--color-stone-100)_65%)]",
        className,
      )}
      {...props}
    />
  );
}
