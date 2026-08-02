"use client";

import type { ComponentProps } from "react";

import { X } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";

import { Icon } from "@/components/brand/icon";
import { cn } from "@/lib/utils";

/**
 * Sheet (drawer) — docs/02-ux-blueprint.md §1.3.
 *
 * The quote basket, showroom booking and admin bulk-edit drawers all use this,
 * and the mobile filter panel is the `block-end` variant (§6.4).
 *
 * API CHANGE from stock shadcn: `side` takes LOGICAL values, not
 * "left" | "right". "The quote basket opens on the right" is only true in
 * English; in Arabic it opens on the left, and a physically-named API makes
 * that a per-call-site decision that will eventually be got wrong. `inline-end`
 * is correct in both locales, which is the whole argument for logical
 * properties (docs/01-architecture.md §3.6).
 *
 * `inline-start`/`inline-end` are kept distinct rather than collapsed, because
 * a navigation drawer genuinely does belong at the inline start while the
 * basket belongs at the inline end.
 */

type SheetSide = "inline-start" | "inline-end" | "block-start" | "block-end";

function Sheet(props: ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(props: ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal(props: ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-navy-950/60",
        "data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in",
        className,
      )}
      {...props}
    />
  );
}

/** Per-side geometry and entrance. Inline sides share one direction-aware keyframe. */
const SIDE_CLASSES: Record<SheetSide, string> = {
  "inline-end":
    "inset-block-0 end-0 h-full w-3/4 border-s sm:max-w-sm data-[state=open]:animate-slide-in-inline data-[state=closed]:animate-slide-out-inline",
  "inline-start":
    "inset-block-0 start-0 h-full w-3/4 border-e sm:max-w-sm data-[state=open]:animate-slide-in-inline data-[state=closed]:animate-slide-out-inline",
  "block-start":
    "inset-inline-0 top-0 h-auto border-b data-[state=open]:animate-slide-in-block-start data-[state=closed]:animate-slide-out-block-start",
  // The mobile default: bottom sheets are the primary overlay on small screens
  // (§5.11), with snap points and swipe-dismiss added in Phase 2.
  "block-end":
    "inset-inline-0 bottom-0 h-auto rounded-t-lg border-t data-[state=open]:animate-slide-in-block-end data-[state=closed]:animate-slide-out-block-end",
};

function SheetContent({
  className,
  children,
  side = "inline-end",
  showCloseButton = true,
  closeLabel = "Close",
  ...props
}: ComponentProps<typeof SheetPrimitive.Content> & {
  side?: SheetSide;
  showCloseButton?: boolean;
  closeLabel?: string;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-background shadow-overlay",
          SIDE_CLASSES[side],
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <SheetPrimitive.Close
            aria-label={closeLabel}
            className="absolute end-3 top-3 flex size-11 items-center justify-center rounded-full text-stone-600 transition-surface duration-instant ease-material hover:bg-stone-50 hover:text-foreground disabled:pointer-events-none"
          >
            <Icon icon={X} size="sm" />
          </SheetPrimitive.Close>
        ) : null}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 border-b border-border p-6", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "mt-auto flex flex-col gap-2 border-t border-border p-6",
        className,
      )}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-heading-md text-foreground", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-body-sm text-stone-600", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  type SheetSide,
};
