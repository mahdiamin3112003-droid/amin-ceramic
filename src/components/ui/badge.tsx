import type { ComponentProps, ReactNode } from "react";

import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { Diamond } from "@/components/brand/diamond";
import { ShadeVariationIcon, SlipRatingIcon } from "@/components/brand/spec-icons";
import { cn } from "@/lib/utils";

/**
 * Badge — docs/02-ux-blueprint.md §4.12. All twelve variants.
 *
 * "`sm` radius, `caption` type, 4px/8px padding, always icon + text."
 *
 * `sm` radius, not a pill: §4.5 reserves `full` for avatars and pills only.
 * Stock shadcn ships `rounded-full` here, which is one of several defaults this
 * file exists to undo.
 *
 * The rule that shapes the API: "Semantic colour never carries meaning alone —
 * always paired with an icon or text label" (§4.1 rule 4, §7.3). So the stock
 * indicators are real shapes — filled, half, hollow — and `children` is
 * required. A colour-only badge cannot be expressed here.
 */
const badgeVariants = cva(
  [
    "inline-flex w-fit shrink-0 items-center gap-1.5 text-caption",
    "rounded-sm border border-transparent px-2 py-1 whitespace-nowrap",
    "[&>svg]:size-3.5 [&>svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        inStock: "bg-success-50 text-success-600",
        lowStock: "bg-warning-50 text-warning-600",
        outOfStock: "bg-stone-100 text-stone-600",
        new: "bg-primary text-primary-foreground",
        bestSeller: "bg-cyan-100 text-navy-900",
        outdoor: "border-stone-300 text-stone-600",
        slip: "border-primary text-primary",
        shade: "border-primary text-primary",
        tradeOnly: "bg-navy-900 text-white",
        discontinued: "bg-stone-100 text-stone-600 line-through",
        match: "bg-stone-50 text-navy-900",
        /** Admin only: marks any AI-produced field until a human approves it. */
        aiGenerated: "bg-cyan-50 text-navy-900",
      },
    },
    defaultVariants: { variant: "inStock" },
  },
);

/**
 * Stock indicator — a shape, not just a colour.
 * Filled = in stock, half = low, hollow = out.
 */
function StockDot({ fill }: { fill: "full" | "half" | "none" }) {
  return (
    <svg viewBox="0 0 8 8" aria-hidden="true" focusable="false" className="size-2">
      {fill === "full" ? <circle cx="4" cy="4" r="4" fill="currentColor" /> : null}
      {fill === "half" ? (
        <>
          <circle
            cx="4"
            cy="4"
            r="3.25"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
          />
          <path d="M4 0.75A3.25 3.25 0 0 1 4 7.25Z" fill="currentColor" />
        </>
      ) : null}
      {fill === "none" ? (
        <circle
          cx="4"
          cy="4"
          r="3.25"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
      ) : null}
    </svg>
  );
}

type BadgeVariant = NonNullable<
  NonNullable<VariantProps<typeof badgeVariants>["variant"]>
>;

export interface BadgeProps
  extends ComponentProps<"span">, VariantProps<typeof badgeVariants> {
  asChild?: boolean;
  /** Overrides the variant's default icon. Pass `null` for text alone. */
  icon?: ReactNode | null;
  /** Shade grade, for the `shade` variant. */
  shadeLevel?: 1 | 2 | 3 | 4;
  /** Always required — a badge is never colour alone. */
  children: ReactNode;
}

/** Each variant's default icon, so call sites cannot forget one. */
function defaultIconFor(
  variant: BadgeVariant,
  shadeLevel: 1 | 2 | 3 | 4,
): ReactNode {
  switch (variant) {
    case "inStock":
      return <StockDot fill="full" />;
    case "lowStock":
      return <StockDot fill="half" />;
    case "outOfStock":
    case "discontinued":
      return <StockDot fill="none" />;
    case "slip":
      return <SlipRatingIcon />;
    case "shade":
      return <ShadeVariationIcon level={shadeLevel} />;
    case "aiGenerated":
      return <Diamond className="size-3" />;
    default:
      return null;
  }
}

export function Badge({
  className,
  variant = "inStock",
  asChild = false,
  icon,
  shadeLevel = 2,
  children,
  ...props
}: BadgeProps) {
  const Comp = asChild ? Slot.Root : "span";
  const resolvedIcon =
    icon === undefined ? defaultIconFor(variant ?? "inStock", shadeLevel) : icon;

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      {resolvedIcon}
      {children}
    </Comp>
  );
}

/**
 * Match percentage — docs/02-ux-blueprint.md §4.12 and §5.9.
 *
 * "Pill with a circular progress ring, colour stepping success -> warning by band."
 *
 * The number is never presented alone: §7.2 requires the reason to be announced
 * with it ("94 percent match. Same warm beige and matte finish, veining
 * slightly finer"), so `reason` feeds the accessible name rather than being
 * left to a neighbouring element to supply.
 *
 * `value` is a CALIBRATED score, never raw cosine distance
 * (docs/01-architecture.md §6.3 step 8: "0.71 cosine is not '71% match'").
 */
export function MatchBadge({
  value,
  reason,
  className,
  ...props
}: Omit<ComponentProps<"span">, "children"> & {
  /** Calibrated match score, 0–100. */
  value: number;
  /** The grounded one-sentence explanation, for the accessible name. */
  reason?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const circumference = 2 * Math.PI * 7;

  // Bands per §4.12: success -> warning as confidence falls.
  const tone =
    clamped >= 85
      ? "text-success-600"
      : clamped >= 65
        ? "text-navy-700"
        : "text-warning-600";

  return (
    <span
      data-slot="match-badge"
      className={cn(badgeVariants({ variant: "match" }), tone, className)}
      role="img"
      aria-label={
        reason
          ? `${String(clamped)}% match. ${reason}`
          : `${String(clamped)}% match`
      }
      {...props}
    >
      <svg
        viewBox="0 0 18 18"
        aria-hidden="true"
        focusable="false"
        className="size-4"
      >
        <circle
          cx="9"
          cy="9"
          r="7"
          className="stroke-stone-300"
          strokeWidth="2"
          fill="none"
        />
        <circle
          cx="9"
          cy="9"
          r="7"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="butt"
          strokeDasharray={`${String((clamped / 100) * circumference)} ${String(circumference)}`}
          transform="rotate(-90 9 9)"
        />
      </svg>
      <span className="tabular-nums" aria-hidden="true">
        {clamped}%
      </span>
    </span>
  );
}

export { badgeVariants };
