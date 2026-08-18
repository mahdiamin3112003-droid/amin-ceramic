import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { TileFinderView } from "@/app/[locale]/(ai)/tile-finder/tile-finder-view";
import { listProducts } from "@/application/use-cases/catalog/list-products";
import { isTileFinderEnabled } from "@/lib/feature-flags";
import { isLocale } from "@/i18n/routing";

/**
 * `/tile-finder` — docs/02-ux-blueprint.md §3.4.
 *
 * A thin server shell: it resolves the real catalogue size and hands the
 * four interactive states to the client component.
 *
 * ── The count is read, never written down ──
 * §3.4's wireframe reads "We'll match it against 1,284 products", a number
 * invented at design time. Shipping any literal here would be a claim that
 * silently rots as the catalogue grows; the real total costs one query the
 * listing page already makes.
 *
 * ── WhatsApp is absent on purpose ──
 * §3.4's STATE 4 offers "send it to us directly: [WhatsApp]". No WhatsApp
 * number exists anywhere in the schema or settings, so there is nothing to
 * link to — and inventing one would put a fake contact route in front of a
 * customer who has just been told we cannot help. The control renders only
 * when a number is configured; wiring that setting is its own task.
 */
export const dynamic = "force-dynamic";

export default async function TileFinderPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  /**
   * 404 rather than a "coming soon" page, deliberately: it neither
   * advertises unfinished work nor confirms the route exists, and it
   * matches exactly what production serves today.
   */
  if (!isTileFinderEnabled()) notFound();
  setRequestLocale(locale);

  const { page } = await listProducts(locale, {});

  return (
    <main id="main" className="mx-auto max-w-content px-gutter">
      <TileFinderView catalogueSize={page?.totalCount ?? 0} whatsappUrl={null} />
    </main>
  );
}
