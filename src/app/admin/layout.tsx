import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { fontVariables } from "@/lib/fonts";

import "../globals.css";

/**
 * Admin root — renders `<html>`/`<body>` itself, because `src/app/layout.tsx`
 * is a pass-through and `[locale]/layout.tsx` (the other place they are
 * rendered) is not an ancestor of this route.
 *
 * Admin sits OUTSIDE `[locale]` deliberately (docs/02 §1.2): it is
 * English-only in v1, so there is no locale to negotiate, no `dir` to flip
 * and no `next-intl` provider. The public site stays bilingual and is
 * unaffected.
 *
 * That English-only decision does NOT license physical CSS properties. Every
 * style here uses logical properties like everywhere else — partly because
 * the lint rule is repository-wide, mostly because "admin will never be
 * translated" is the kind of assumption that costs 3–4x when it turns out to
 * be wrong.
 */
export const metadata: Metadata = {
  title: {
    default: "Admin · AMIN CERAMIC",
    template: "%s · Admin · AMIN CERAMIC",
  },
  // The back office must never appear in an index, and must not be
  // previewed by link unfurlers either.
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={fontVariables} suppressHydrationWarning>
      <body className="min-h-dvh bg-stone-50 font-sans text-foreground antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
