import {
  LoadingAnnouncement,
  PageHeaderSkeleton,
} from "@/app/admin/(dashboard)/loading-parts";
import { Skeleton } from "@/components/ui/skeleton";

/** Two tabs over a card grid — the shape the real page renders. */
export default function CollectionsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingAnnouncement label="Loading collections" />
      <PageHeaderSkeleton />
      <div className="flex gap-1">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-28" />
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <li
            key={i}
            className="overflow-hidden rounded-lg border border-border bg-white"
          >
            <Skeleton className="aspect-[3/2] w-full rounded-none" />
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-full" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
