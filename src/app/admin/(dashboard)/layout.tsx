import type { ReactNode } from "react";

import { redirect } from "next/navigation";

import { ADMIN_NAV } from "@/app/admin/(dashboard)/nav";
import { AdminSidebar } from "@/app/admin/(dashboard)/sidebar";
import { IdleTimeout } from "@/app/admin/(dashboard)/idle-timeout";
import { UserMenu } from "@/app/admin/(dashboard)/user-menu";
import { getCurrentStaff } from "@/application/auth/session";

/**
 * The signed-in admin shell.
 *
 * This layout is the SECOND gate, not the first. Middleware already turned
 * away anyone without a Supabase session; what it could not answer — from
 * the edge, without database access — is whether that session belongs to an
 * active staff member and what they may do. Both are settled here, and both
 * are settled again by RLS underneath every query these pages run.
 */
export default async function AdminDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getCurrentStaff();

  // A valid Supabase account with no active `AppUser` row is not staff.
  if (!session) redirect("/admin/login");

  // Roles that require a second factor hold NO permissions until it is
  // done, so letting them into the shell would render an empty sidebar and
  // a wall of 403s. Send them to finish instead.
  if (session.mfaRequired && !session.mfaSatisfied) redirect("/admin/2fa");

  // Filtered on the SERVER. The client sidebar receives only what this user
  // may open, so the permission list never reaches the browser.
  const sections = ADMIN_NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) =>
      session.permissions.includes(item.permission),
    ),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-64 shrink-0 border-e border-border bg-white lg:block">
        <AdminSidebar sections={sections} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-white px-gutter">
          {/*
            The sidebar is desktop-only for now; on narrow screens the
            heading carries the context instead. A drawer for mobile admin
            is Phase 9 work — the back office is a desk tool, and shipping a
            half-considered mobile nav is worse than a clear desktop one.
          */}
          <span className="font-display text-body-lg lg:sr-only">Admin</span>
          <UserMenu
            email={session.email}
            fullName={session.fullName}
            roleKeys={session.roleKeys}
          />
        </header>

        <main className="min-w-0 flex-1 px-gutter py-8">{children}</main>
      </div>

      <IdleTimeout />
    </div>
  );
}
