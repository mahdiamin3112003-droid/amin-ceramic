import type { LucideIcon, LucideProps } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Lucide wrapper — docs/02-ux-blueprint.md §4.11.
 *
 * "Lucide, 1.5px stroke, 20px default (16 in dense contexts, 24 in nav).
 *  Consistent stroke weight is what keeps an icon set from looking assembled
 *  from three sources."
 *
 * lucide-react has no context provider, so those defaults have to be applied
 * somewhere. Applying them here — rather than trusting every call site to pass
 * `strokeWidth={1.5}` — is the difference between a rule and a hope.
 *
 * Icons never appear alone in a control unless the control is universally
 * understood (close, search, menu). Everything else pairs with a visible label
 * or carries an `aria-label`, which is why `label` is required to be explicit.
 */

const SIZES = {
  /** Dense contexts: spec tables, badges, chips. */
  sm: 16,
  /** Default. */
  md: 20,
  /** Navigation. */
  lg: 24,
} as const;

export type IconSize = keyof typeof SIZES;

export interface IconProps extends Omit<LucideProps, "size" | "ref"> {
  icon: LucideIcon;
  size?: IconSize;
  /**
   * Accessible name. Pass a string when the icon carries meaning on its own;
   * omit it when an adjacent visible label already names the control, and the
   * icon is then correctly hidden from assistive technology.
   */
  label?: string;
}

export function Icon({
  icon: LucideGlyph,
  size = "md",
  label,
  className,
  ...props
}: IconProps) {
  return (
    <LucideGlyph
      size={SIZES[size]}
      strokeWidth={1.5}
      absoluteStrokeWidth
      className={cn("shrink-0", className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      focusable="false"
      {...props}
    />
  );
}
