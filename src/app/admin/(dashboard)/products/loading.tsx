import {
  FiltersSkeleton,
  LoadingAnnouncement,
  PageHeaderSkeleton,
  TableSkeleton,
} from "@/app/admin/(dashboard)/loading-parts";

export default function AdminProductsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingAnnouncement label="Loading products" />
      <PageHeaderSkeleton withAction />
      <FiltersSkeleton />
      <TableSkeleton rows={8} columns={6} />
    </div>
  );
}
