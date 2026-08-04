/**
 * Admin navigation, declared as DATA keyed by permission.
 *
 * The point is that "what may I see" and "what may I do" come from the same
 * source. A nav item is rendered only when the caller holds `permission`,
 * and the page behind it calls `requirePermission` with the same key — so
 * the menu cannot drift into advertising a page that will 403.
 *
 * Hiding a link is a COURTESY, not a control. The enforcement is
 * `requirePermission` in the page plus RLS underneath it; this list only
 * decides what is worth showing.
 */
export interface AdminNavItem {
  readonly href: string;
  readonly label: string;
  readonly permission: string;
  /** Match child routes too — `/admin/products/new` lights up "Products". */
  readonly prefix?: boolean;
}

export interface AdminNavSection {
  readonly heading: string;
  readonly items: readonly AdminNavItem[];
}

export const ADMIN_NAV: readonly AdminNavSection[] = [
  {
    heading: "Catalogue",
    items: [
      {
        href: "/admin/products",
        label: "Products",
        permission: "product.read",
        prefix: true,
      },
      {
        href: "/admin/taxonomy",
        label: "Taxonomy",
        // The vocabularies the catalogue filters by — materials, finishes,
        // surface looks, colour families, applications, layout patterns.
        permission: "content.manage",
        prefix: true,
      },
      {
        href: "/admin/media",
        label: "Media",
        permission: "media.manage",
        prefix: true,
      },
    ],
  },
  {
    heading: "Operations",
    items: [
      {
        href: "/admin/inventory",
        label: "Inventory",
        permission: "inventory.read",
        prefix: true,
      },
      {
        href: "/admin/requests",
        label: "Quote requests",
        permission: "request.read",
        prefix: true,
      },
    ],
  },
  {
    heading: "Administration",
    items: [
      {
        href: "/admin/audit",
        label: "Audit log",
        permission: "audit.read",
        prefix: true,
      },
      // Settings (`settings.write`) and user/role management are Phase 7.
    ],
  },
];

export function isActive(pathname: string, item: AdminNavItem): boolean {
  return item.prefix
    ? pathname === item.href || pathname.startsWith(`${item.href}/`)
    : pathname === item.href;
}
