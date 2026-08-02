"use client";

import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";

import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, Check } from "lucide-react";

import { Icon } from "@/components/brand/icon";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Input — docs/02-ux-blueprint.md §4.8, all eight states.
 *
 * HEIGHT. §4.8 specifies 40px for `md`. Two other sections contradict it —
 * §6.5 ("Every interactive element clears 44×44") and §7.5 ("we hold to 44×44
 * as house standard") — so `md` is 44px here and the documented 40px is
 * available as `sm` for dense admin tables. Two sections plus the accessibility
 * argument beat one. Flagged rather than silently changed; see
 * docs/adr/0008-input-height.md.
 *
 * No focus ring here: the one system-wide `:focus-visible` treatment in
 * globals.css applies (§7.4). The border-colour change on focus is a separate
 * signal and is kept.
 */
const inputVariants = cva(
  [
    "bg-background w-full min-w-0 rounded-sm border",
    "text-body text-foreground placeholder:text-stone-500",
    "transition-[border-color,background-color] duration-instant ease-material",
    "disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500",
    // Read-only loses its border and takes a stone fill: it reads as a value,
    // not as something you are invited to type into.
    "read-only:border-transparent read-only:bg-stone-50",
    "file:text-body-sm file:border-0 file:bg-transparent file:font-medium",
  ],
  {
    variants: {
      inputSize: {
        sm: "h-10 px-3",
        md: "h-11 px-3",
        lg: "h-13 px-4",
      },
      state: {
        default: [
          "border-stone-300",
          "hover:border-stone-500",
          "focus:border-primary",
          // Disabled must not react to hover (§4.8).
          "disabled:border-stone-300 disabled:hover:border-stone-300",
        ],
        error: "border-danger-600 bg-danger-50",
        success: "border-success-600",
      },
      hasTrailingIcon: {
        true: "pe-10",
        false: "",
      },
    },
    defaultVariants: {
      inputSize: "md",
      state: "default",
      hasTrailingIcon: false,
    },
  },
);

export interface InputProps
  extends Omit<ComponentProps<"input">, "size">,
    Pick<VariantProps<typeof inputVariants>, "inputSize"> {
  /** Error message. Its presence puts the field into the error state. */
  error?: string;
  /** Used sparingly — async validation only (§4.8). */
  success?: boolean;
}

export function Input({
  className,
  type,
  inputSize = "md",
  error,
  success = false,
  ...props
}: InputProps) {
  const state = error ? "error" : success ? "success" : "default";
  const showTrailing = state !== "default";

  return (
    <div className="relative w-full">
      <input
        type={type}
        data-slot="input"
        data-state={state}
        aria-invalid={error ? true : undefined}
        className={cn(
          inputVariants({ inputSize, state, hasTrailingIcon: showTrailing }),
          className,
        )}
        {...props}
      />
      {showTrailing ? (
        <span
          className={cn(
            "pointer-events-none absolute inset-block-0 end-3 flex items-center",
            state === "error" ? "text-danger-600" : "text-success-600",
          )}
        >
          <Icon icon={state === "error" ? AlertTriangle : Check} size="sm" />
        </span>
      ) : null}
    </div>
  );
}

/**
 * Field — label + control + helper/error, wired together.
 *
 * "Helper text sits below and is replaced by the error message, not stacked
 *  with it." That replacement is the whole reason this wrapper exists: leaving
 *  it to each call site is how you end up with both showing at once.
 */
export interface FieldProps {
  label: string;
  /** Format example only — never a substitute for the label (§4.8). */
  helper?: string;
  error?: string;
  required?: boolean;
  requiredLabel?: string;
  /** Marks the field explicitly optional, where optional is the minority. */
  optional?: boolean;
  optionalLabel?: string;
  children: (props: {
    id: string;
    "aria-describedby": string | undefined;
  }) => ReactNode;
  className?: string;
}

export function Field({
  label,
  helper,
  error,
  required,
  requiredLabel,
  optional,
  optionalLabel = "optional",
  children,
  className,
}: FieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const hasMessage = Boolean(error ?? helper);

  return (
    <div className={cn("group flex flex-col gap-2", className)}>
      <Label htmlFor={id} required={required} requiredLabel={requiredLabel}>
        {label}
        {optional ? (
          <span className="text-stone-600">({optionalLabel})</span>
        ) : null}
      </Label>

      {children({
        id,
        "aria-describedby": hasMessage ? messageId : undefined,
      })}

      {hasMessage ? (
        <p
          id={messageId}
          // Errors are announced; helper text is not, because it is already
          // reachable through aria-describedby (§7.2).
          role={error ? "alert" : undefined}
          className={cn(
            "text-body-sm flex items-center gap-1.5",
            error ? "text-danger-600" : "text-stone-600",
          )}
        >
          {error ? <Icon icon={AlertTriangle} size="sm" /> : null}
          {error ?? helper}
        </p>
      ) : null}
    </div>
  );
}

export { inputVariants };
