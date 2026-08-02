"use client";

import type { ComponentProps } from "react";

import { Check } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Checkbox — used heavily by the catalog filter rail (docs/02-ux-blueprint.md §3.2).
 *
 * The box is 20px, but the `before` pseudo-element extends the hit area to
 * 44×44 without affecting layout. §6.5 requires every interactive element to
 * clear 44×44, and a 20px checkbox on a phone is a genuinely frustrating target
 * — which matters here because filtering is the catalog's primary interaction.
 *
 * No focus ring: the global `:focus-visible` treatment applies (§7.4).
 */
function Checkbox({
  className,
  ...props
}: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative size-5 shrink-0 rounded-sm border border-input",
        "transition-surface duration-instant ease-material",
        "before:absolute before:start-1/2 before:top-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
        "hover:border-stone-500",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        "aria-invalid:border-danger-600",
        "disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-100",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current"
      >
        <Check size={14} strokeWidth={2.5} aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
