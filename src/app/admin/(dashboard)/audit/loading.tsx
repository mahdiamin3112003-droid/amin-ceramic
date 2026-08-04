import {
  FiltersSkeleton,
  LoadingAnnouncement,
  PageHeaderSkeleton,
  TableSkeleton,
} from "@/app/admin/(dashboard)/loading-parts";

export default function AdminAuditLoading() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingAnnouncement label="Loading audit log" />
      <PageHeaderSkeleton />
      <FiltersSkeleton fields={3} />
      <TableSkeleton rows={10} columns={6} />
    </div>
  );
}
