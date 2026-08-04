import type { ReactNode } from "react";

/**
 * Empty states.
 *
 * An empty table is one of two entirely different situations, and telling
 * them apart is the whole job:
 *
 *  - NOTHING EXISTS YET. The user needs to know what this screen is for and
 *    how to put the first thing in it.
 *  - NOTHING MATCHES. The data exists; the filters are hiding it. The user
 *    needs the filters cleared, not an explanation of the feature.
 *
 * Showing "No products" for both is the common mistake and it strands
 * people: someone with 4,000 products reads it as data loss. `variant`
 * forces the caller to say which one it is.
 */
export function EmptyState({
  variant = "empty",
  title,
  description,
  action,
}: {
  variant?: "empty" | "no-results";
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-stone-300 bg-white px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-stone-50 text-stone-500">
        {variant === "no-results" ? <SearchGlyph /> : <TileGlyph />}
      </span>

      <div className="flex flex-col gap-1.5">
        <p className="font-display text-body-lg text-foreground">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-body-sm leading-relaxed text-stone-600">
            {description}
          </p>
        ) : null}
      </div>

      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/** Three tiles on the brand's 45° axis — an empty wall, not a generic box. */
function TileGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-5">
      <rect
        x="2.5"
        y="6"
        width="9"
        height="5"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="12.5"
        y="6"
        width="9"
        height="5"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="2 2"
      />
      <rect
        x="2.5"
        y="13"
        width="9"
        height="5"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="2 2"
      />
    </svg>
  );
}

function SearchGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-5">
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="m15.5 15.5 4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
