import {
  CardGridSkeleton,
  LoadingAnnouncement,
  PageHeaderSkeleton,
} from "@/app/admin/(dashboard)/loading-parts";

/** Overview. Mirrors the section-card grid the real page renders. */
export default function AdminOverviewLoading() {
  return (
    <div className="flex flex-col gap-8">
      <LoadingAnnouncement label="Loading overview" />
      <PageHeaderSkeleton />
      <CardGridSkeleton items={6} />
    </div>
  );
}
