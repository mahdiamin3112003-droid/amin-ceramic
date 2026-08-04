"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActive, type AdminNavSection } from "@/app/admin/(dashboard)/nav";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/**
 * The sections handed in are ALREADY FILTERED by the server layout against
 * the caller's permissions. This component never sees an item the user may
 * not open, which is why it does no permission checking of its own — a
 * client component cannot be trusted to, and duplicating the logic here
 * would just create somewhere for the two copies to disagree.
 *
 * ── The active state ──
 * A filled navy pill was the first attempt and it was wrong: at rest, half
 * the sidebar's visual weight sat on whichever page you happened to be on,
 * which fights the content for attention all day. The replacement is a
 * quiet tinted row plus a cyan rail on the inline-start edge — the rail is
 * unmistakable at a glance and costs the eye nothing.
 *
 * `aria-current` carries the same information independently, so the signal
 * never depends on seeing colour.
 */
export function AdminSidebar({
  sections,
}: {
  sections: readonly AdminNavSection[];
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections" className="flex h-full flex-col gap-8 p-5">
      <Link
        href="/admin"
        className="group flex items-center gap-3 rounded-md px-2 py-1.5 transition-surface hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700"
      >
        <Logo className="size-8 shrink-0 transition-transform duration-base ease-material group-hover:scale-105" />
        <span className="flex flex-col gap-0.5">
          <span className="font-display text-body-sm leading-none tracking-[0.2em] uppercase">
            Amin Ceramic
          </span>
          <span className="text-caption leading-none tracking-[0.16em] text-stone-500 uppercase">
            Back office
          </span>
        </span>
      </Link>

      <div className="flex flex-col gap-7">
        {sections.map((section) => (
          <div key={section.heading} className="flex flex-col gap-1.5">
            <h2 className="px-2 text-caption tracking-[0.16em] text-stone-500 uppercase">
              {section.heading}
            </h2>
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex min-h-11 items-center rounded-md ps-4 pe-3 text-body-sm transition-surface",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700",
                        active
                          ? "bg-navy-700/8 font-medium text-navy-700"
                          : "text-stone-600 hover:bg-stone-100 hover:text-foreground",
                      )}
                    >
                      {/* The rail. Scales from nothing on the block axis so
                          moving between items reads as one indicator sliding
                          rather than two blinking. */}
                      <span
                        aria-hidden
                        style={{ insetInlineStart: 0 }}
                        className={cn(
                          "absolute top-1.5 bottom-1.5 w-0.5 origin-center rounded-full bg-cyan-400 transition-transform duration-base ease-material",
                          active ? "scale-y-100" : "scale-y-0",
                        )}
                      />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
