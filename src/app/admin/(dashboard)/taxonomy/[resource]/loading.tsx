import {
  LoadingAnnouncement,
  PageHeaderSkeleton,
} from "@/app/admin/(dashboard)/loading-parts";
import { Skeleton } from "@/components/ui/skeleton";

export default function TaxonomyLoading() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingAnnouncement label="Loading taxonomy" />
      <PageHeaderSkeleton />
      <div className="flex justify-end">
        <Skeleton className="h-11 w-36 rounded-md" />
      </div>
      {/* Same row height and rule as the real list. */}
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-border p-4 last:border-b-0"
          >
            <Skeleton className="h-10 w-6" />
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-8 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}
