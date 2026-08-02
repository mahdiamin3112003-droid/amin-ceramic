import type { ComponentProps, ReactNode } from "react";

import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { DiamondSpinner } from "@/components/brand/diamond";
import { cn } from "@/lib/utils";

/**
 * Button — docs/02-ux-blueprint.md §4.7.
 *
 * Six variants, three sizes, every state. Nothing from stock shadcn survives:
 * the palette, the type scale, the radii and the focus treatment are all ours.
 *
 * Decisions that are easy to undo by accident:
 *
 *  - NO focus styling here. There is exactly one focus treatment in the system
 *    and it lives on `:focus-visible` in globals.css (§7.4). A component that
 *    sets its own ring is how a design system ends up with four of them.
 *
 *  - Sizes are 32 / 44 / 52px tall per §4.7. Icon-only buttons are 44×44 at
 *    every size: "Minimum touch target 44×44 everywhere, including icon buttons."
 *
 *  - Loading keeps the label in place and swaps the leading icon slot for a
 *    diamond spinner. Width does not change — which prevents layout shift and
 *    the accidental double-click you get when a button resizes under the cursor.
 *
 *  - Hover uses Tailwind's `hover:` variant, which compiles to an
 *    `@media (hover: hover)` guard. On touch, hover styling on tap is a bug.
 */
const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2",
    "rounded-md font-medium whitespace-nowrap",
    "transition-[background-color,color,border-color,box-shadow,transform]",
    "duration-quick ease-material",
    "disabled:pointer-events-none",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        /** navy-700 -> navy-800 hover -> navy-600 active. */
        primary: [
          "bg-primary text-primary-foreground",
          "hover:bg-navy-800 hover:shadow-hover",
          "active:scale-[0.98] active:bg-navy-600",
          "disabled:bg-stone-100 disabled:text-stone-500 disabled:shadow-none",
        ],
        /** White with a navy hairline; fills cyan-50 on hover. */
        secondary: [
          "border border-primary bg-background text-primary",
          "hover:bg-cyan-50",
          "active:scale-[0.98] active:bg-cyan-100",
          "disabled:border-stone-300 disabled:bg-background disabled:text-stone-500",
        ],
        ghost: [
          "bg-transparent text-primary",
          "hover:bg-stone-50",
          "active:bg-stone-100",
          "disabled:bg-transparent disabled:text-stone-500",
        ],
        /** Underline offset stays 4px; the line thickens rather than moving. */
        text: [
          "bg-transparent text-primary underline underline-offset-4",
          "decoration-1 hover:decoration-2",
          "disabled:text-stone-500 disabled:no-underline",
        ],
        destructive: [
          "bg-destructive text-destructive-foreground",
          "hover:bg-danger-700",
          "active:scale-[0.98]",
          "disabled:bg-stone-100 disabled:text-stone-500",
        ],
        /** Transparent, with a stone circle appearing behind it on hover. */
        icon: [
          "rounded-full bg-transparent text-foreground",
          "hover:bg-stone-50",
          "active:bg-stone-100",
          "disabled:bg-transparent disabled:text-stone-500",
        ],
      },
      size: {
        sm: "h-8 px-3 text-body-sm",
        md: "h-11 px-5 text-body",
        lg: "h-13 px-7 text-body-lg",
      },
      /** Icon-only buttons are square and never below the touch target. */
      iconOnly: {
        true: "gap-0 p-0",
        false: "",
      },
    },
    compoundVariants: [
      { iconOnly: true, size: "sm", class: "size-11" },
      { iconOnly: true, size: "md", class: "size-11" },
      { iconOnly: true, size: "lg", class: "size-13" },
    ],
    defaultVariants: {
      variant: "primary",
      size: "md",
      iconOnly: false,
    },
  },
);

type ButtonBaseProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants>;

export interface ButtonProps extends Omit<ButtonBaseProps, "iconOnly"> {
  asChild?: boolean;
  /**
   * Swaps the leading icon slot for a diamond spinner without changing the
   * button's width, and disables interaction.
   */
  loading?: boolean;
  /**
   * Announced while `loading` is true. A spinner alone communicates nothing to
   * a screen reader (§7.2), so this is how the state actually reaches one.
   */
  loadingLabel?: string;
  /** Leading slot content, replaced by the spinner while loading. */
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  /** Square icon-only button. Still 44×44 minimum. */
  iconOnly?: boolean;
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  asChild = false,
  loading = false,
  loadingLabel,
  leadingIcon,
  trailingIcon,
  iconOnly = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-loading={loading || undefined}
      className={cn(buttonVariants({ variant, size, iconOnly }), className)}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <DiamondSpinner className={cn(size === "lg" ? "size-5" : "size-4")} />
      ) : (
        leadingIcon
      )}
      {children}
      {!loading && trailingIcon}
      {loading && loadingLabel ? (
        <span aria-live="polite" className="sr-only">
          {loadingLabel}
        </span>
      ) : null}
    </Comp>
  );
}

export { buttonVariants };
