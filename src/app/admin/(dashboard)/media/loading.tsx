import {
  CardGridSkeleton,
  FiltersSkeleton,
  LoadingAnnouncement,
  PageHeaderSkeleton,
} from "@/app/admin/(dashboard)/loading-parts";

export default function AdminMediaLoading() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingAnnouncement label="Loading media library" />
      <PageHeaderSkeleton />
      <FiltersSkeleton fields={2} />
      <CardGridSkeleton items={10} />
    </div>
  );
}
