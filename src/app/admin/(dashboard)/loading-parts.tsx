import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeletons for the admin routes.
 *
 * docs/02 §4.16: "Skeletons match the final layout exactly — mismatched
 * skeletons cause perceived layout shift even when CLS is technically
 * zero." So these are not generic grey bars: the table skeleton has the
 * same six columns, the same row height and the same header rule as the
 * real table, and the page header reserves the exact space the real
 * heading and its subtitle occupy.
 *
 * Everything is `aria-hidden` via the Skeleton primitive, and each screen
 * announces its loading state once through a polite live region rather
 * than letting a screen reader read out fifty empty boxes.
 */

export function PageHeaderSkeleton({
  withAction = false,
}: {
  withAction?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-2">
        {/* 36px ≈ the rendered height of text-heading-md in Marcellus. */}
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-4 w-72" />
      </div>
      {withAction ? <Skeleton className="h-11 w-36 rounded-md" /> : null}
    </div>
  );
}

export function FiltersSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-white p-4">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-16" />
          {/* The search field flexes; the selects do not — same as the real one. */}
          <Skeleton className={i === 0 ? "h-11 w-56" : "h-11 w-36"} />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({
  rows = 8,
  columns = 6,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white">
      <div className="flex gap-4 border-b border-border p-3">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 border-b border-border p-3 last:border-b-0"
        >
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton
              key={c}
              // The first column carries a name over a secondary line, so it
              // is taller — matching that is the whole point of the exercise.
              className={c === 0 ? "h-9 flex-1" : "h-4 flex-1"}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ items = 10 }: { items?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: items }, (_, i) => (
        <li
          key={i}
          className="overflow-hidden rounded-lg border border-border bg-white"
        >
          <Skeleton className="aspect-square w-full rounded-none" />
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * The single announcement for a loading screen.
 *
 * `polite` rather than `assertive`: a page still loading is not an
 * interruption, and `assertive` would talk over whatever the user was
 * reading when they clicked.
 */
export function LoadingAnnouncement({ label }: { label: string }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {label}
    </span>
  );
}
