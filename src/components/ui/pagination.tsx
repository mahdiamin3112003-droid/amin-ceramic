import type { ComponentProps } from "react";

import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";

import { Icon } from "@/components/brand/icon";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Pagination — docs/02-ux-blueprint.md §3.2.
 *
 * The catalog itself uses a "Load more" button rather than infinite scroll
 * (decision of record #4: back button, footer reachability, SEO). This
 * component is for the numbered paging the admin tables need (§4.10).
 *
 * The chevrons are direction-aware — `rtl:rotate-180` — because "previous" in
 * Arabic points the other way. This is the one place a physical direction is
 * correct rather than a bug, and it is why the lint rule leaves transforms
 * alone.
 */

function Pagination({ className, ...props }: ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  );
}

function PaginationContent({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex flex-row items-center gap-1", className)}
      {...props}
    />
  );
}

function PaginationItem(props: ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />;
}

type PaginationLinkProps = ComponentProps<"a"> & {
  isActive?: boolean;
  size?: "sm" | "md" | "lg";
  iconOnly?: boolean;
};

function PaginationLink({
  className,
  isActive,
  size = "md",
  iconOnly = true,
  ...props
}: PaginationLinkProps) {
  return (
    <a
      aria-current={isActive ? "page" : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      className={cn(
        buttonVariants({
          variant: isActive ? "secondary" : "ghost",
          size,
          iconOnly,
        }),
        "tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

function PaginationPrevious({
  className,
  label = "Previous",
  ...props
}: ComponentProps<typeof PaginationLink> & { label?: string }) {
  return (
    <PaginationLink
      aria-label={label}
      iconOnly={false}
      className={cn("gap-1 px-3", className)}
      {...props}
    >
      <Icon icon={ChevronLeft} size="sm" className="rtl:rotate-180" />
      <span className="max-sm:sr-only">{label}</span>
    </PaginationLink>
  );
}

function PaginationNext({
  className,
  label = "Next",
  ...props
}: ComponentProps<typeof PaginationLink> & { label?: string }) {
  return (
    <PaginationLink
      aria-label={label}
      iconOnly={false}
      className={cn("gap-1 px-3", className)}
      {...props}
    >
      <span className="max-sm:sr-only">{label}</span>
      <Icon icon={ChevronRight} size="sm" className="rtl:rotate-180" />
    </PaginationLink>
  );
}

function PaginationEllipsis({
  className,
  label = "More pages",
  ...props
}: ComponentProps<"span"> & { label?: string }) {
  return (
    <span
      data-slot="pagination-ellipsis"
      className={cn(
        "text-stone-600 flex size-11 items-center justify-center",
        className,
      )}
      {...props}
    >
      <Icon icon={MoreHorizontal} size="sm" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationLink,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
};
