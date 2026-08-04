import {
  LoadingAnnouncement,
  PageHeaderSkeleton,
} from "@/app/admin/(dashboard)/loading-parts";
import { Skeleton } from "@/components/ui/skeleton";

/** Four columns of cards — the same shape the real board renders. */
export default function RequestsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingAnnouncement label="Loading quote requests" />
      <PageHeaderSkeleton />
      <div className="grid gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, column) => (
          <div key={column} className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between border-b border-border pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-6" />
            </div>
            {Array.from({ length: 3 - (column % 2) }, (_, card) => (
              <Skeleton key={card} className="h-44 w-full rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
