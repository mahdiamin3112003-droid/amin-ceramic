"use client";

import type { ComponentProps } from "react";

import { Label as LabelPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Label — docs/02-ux-blueprint.md §4.8.
 *
 * "Labels are always visible above the field — never placeholder-as-label,
 *  which fails for screen readers and vanishes exactly when the user needs it."
 *
 * Required fields carry a red asterisk *and* a legend (§4.13), so the asterisk
 * is rendered with an accessible name rather than left as decoration.
 */
function Label({
  className,
  required,
  requiredLabel = "required",
  children,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root> & {
  required?: boolean;
  /** Accessible name for the asterisk. Translate at the call site. */
  requiredLabel?: string;
}) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "text-body-sm text-foreground flex items-center gap-1 leading-none font-medium select-none",
        "group-data-[disabled=true]:text-stone-500 peer-disabled:text-stone-500",
        className,
      )}
      {...props}
    >
      {children}
      {required ? (
        <>
          <span aria-hidden="true" className="text-danger-600">
            *
          </span>
          <span className="sr-only">({requiredLabel})</span>
        </>
      ) : null}
    </LabelPrimitive.Root>
  );
}

export { Label };
