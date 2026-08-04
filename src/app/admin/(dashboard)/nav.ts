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
      // Collections (`content.manage`) is Phase 6. Deliberately NOT listed
      // yet: a nav item that 404s is worse than an absent one, because it
      // reads as a bug in something that works rather than as a section that
      // does not exist. Same for Quote requests and Settings below.
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
      // Quote requests (`request.read`) is Phase 6.
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
