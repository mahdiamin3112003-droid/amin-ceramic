import type { ReactNode } from "react";

import { CompareProvider } from "@/components/catalog/compare-context";
import { CompareTray } from "@/components/catalog/compare-tray";

/**
 * Wraps `/products`, `/products/[slug]`, `/search` and `/compare` so the
 * compare-tray selection (docs/02-ux-blueprint.md §3.2/§3.6) survives
 * client-side navigation between them — the provider stays mounted as long
 * as navigation stays inside this route group.
 */
export default function CatalogLayout({ children }: { children: ReactNode }) {
  return (
    <CompareProvider>
      {children}
      <CompareTray />
    </CompareProvider>
  );
}
