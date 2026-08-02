"use client";

import type { CSSProperties } from "react";

import { AlertTriangle, Check, Info, OctagonX } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { Diamond, DiamondSpinner } from "@/components/brand/diamond";
import { Icon } from "@/components/brand/icon";

/**
 * Toast — docs/02-ux-blueprint.md §3.5 lists "Toast" among the primitives;
 * shadcn has since deprecated its own Toast in favour of Sonner, so that is
 * what backs it. The name in the design system is unchanged.
 *
 * Behaviour from §4.18: "bottom-right desktop, top mobile (below the header,
 * above content), max 3 stacked, 4–5s, pause on hover, dismissible,
 * role='status'." Sonner gives us pause-on-hover, dismissal and the live region
 * for free; the rest is configured here so no call site has to remember it.
 *
 * `next-themes` is deliberately not wired in: the public site is white, and
 * dark mode is admin-only in v1.1 (§4.1). Revisit with the admin shell.
 */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      position="bottom-right"
      mobileOffset={{ top: "4.5rem" }}
      visibleToasts={3}
      duration={4500}
      closeButton
      icons={{
        success: <Icon icon={Check} size="sm" className="text-success-600" />,
        info: <Icon icon={Info} size="sm" className="text-info-600" />,
        warning: (
          <Icon icon={AlertTriangle} size="sm" className="text-warning-600" />
        ),
        error: <Icon icon={OctagonX} size="sm" className="text-danger-600" />,
        loading: <DiamondSpinner className="size-4 text-primary" />,
        close: <Diamond variant="outline" className="size-3" />,
      }}
      style={
        {
          "--normal-bg": "var(--color-popover)",
          "--normal-text": "var(--color-popover-foreground)",
          "--normal-border": "var(--color-border)",
          "--border-radius": "var(--radius-md)",
          "--toast-close-button-start": "unset",
          "--toast-close-button-end": "0",
          "--toast-close-button-transform": "translate(35%, -35%)",
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-body-sm)",
          boxShadow: "var(--shadow-float)",
        } as CSSProperties
      }
      {...props}
    />
  );
}
