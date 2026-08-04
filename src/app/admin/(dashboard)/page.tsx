import type { Metadata } from "next";
import Link from "next/link";

import { ADMIN_NAV } from "@/app/admin/(dashboard)/nav";
import { getCurrentStaff } from "@/application/auth/session";

export const metadata: Metadata = { title: "Overview" };

/**
 * Landing page for the back office.
 *
 * Deliberately thin. The interesting dashboard — stock alerts, open quote
 * requests, ingestion queue — needs the metrics rollups that arrive in
 * Phase 9, and a page of invented placeholder numbers in an admin tool is
 * actively harmful: staff read them as real.
 */
export default async function AdminOverviewPage() {
  const session = await getCurrentStaff();
  if (!session) return null; // The layout has already redirected.

  const available = ADMIN_NAV.flatMap((section) =>
    section.items.filter((item) => session.permissions.includes(item.permission)),
  );

  const firstName = session.fullName?.split(" ")[0] ?? null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-heading-lg">
          {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        </h1>
        <p className="mt-2 text-body-sm text-stone-600">
          {available.length > 0
            ? "Pick up where you left off."
            : "Your account has no sections assigned yet. Ask an owner to grant you a role."}
        </p>
      </div>

      {available.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {available.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block rounded-lg border border-border bg-white p-5 transition-surface hover:border-cyan-400"
              >
                <span className="font-display text-body-lg">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
