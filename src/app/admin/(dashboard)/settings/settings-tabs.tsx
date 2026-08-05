import Link from "next/link";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/settings", label: "General" },
  { href: "/admin/settings/users", label: "Staff & roles" },
  { href: "/admin/settings/trade", label: "Trade accounts" },
] as const;

/**
 * Links, not a tab widget — each section is its own route with its own
 * filters, so they must be linkable, bookmarkable and back-button correct.
 */
export function SettingsTabs({ active }: { active: string }) {
  return (
    <nav
      aria-label="Settings sections"
      className="flex gap-1 border-b border-border"
    >
      {TABS.map((tab) => {
        const isActive = tab.href === active;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-body-sm transition-surface",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700",
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
