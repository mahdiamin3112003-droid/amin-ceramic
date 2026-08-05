import {
  LoadingAnnouncement,
  PageHeaderSkeleton,
} from "@/app/admin/(dashboard)/loading-parts";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingAnnouncement label="Loading settings" />
      <PageHeaderSkeleton />
      {/* The three section tabs, same height and rule as SettingsTabs. */}
      <div className="flex gap-1 border-b border-border pb-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="flex flex-col gap-4">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
