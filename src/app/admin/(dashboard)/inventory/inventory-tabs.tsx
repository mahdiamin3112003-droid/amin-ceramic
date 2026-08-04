import Link from "next/link";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/inventory", label: "Stock" },
  { href: "/admin/inventory/lots", label: "Lots" },
  { href: "/admin/inventory/movements", label: "Movements" },
] as const;

/**
 * Three views onto the same ledger, as links rather than a Tabs component.
 *
 * Each is its own route with its own filters in the URL, so they must be
 * navigable, linkable and back-button-correct. A client-side tab widget
 * would give up all three to save a page transition nobody asked for.
 */
export function InventoryTabs({ active }: { active: string }) {
  return (
    <nav aria-label="Inventory views" className="flex gap-1 border-b border-border">
      {TABS.map((tab) => {
        const isActive = tab.href === active;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-body-sm transition-surface",
              isActive
                ? "border-navy-700 font-medium text-foreground"
                : "border-transparent text-stone-600 hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
