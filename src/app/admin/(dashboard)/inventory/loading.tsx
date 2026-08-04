import {
  LoadingAnnouncement,
  PageHeaderSkeleton,
  TableSkeleton,
} from "@/app/admin/(dashboard)/loading-parts";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminInventoryLoading() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingAnnouncement label="Loading inventory" />
      <PageHeaderSkeleton />
      {/* The three view tabs, same height and rule as InventoryTabs. */}
      <div className="flex gap-1 border-b border-border pb-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-28" />
      </div>
      <TableSkeleton rows={8} columns={7} />
    </div>
  );
}
