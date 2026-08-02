import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { LocaleSwitcher } from "@/components/brand/locale-switcher";
import { FoundationProof } from "@/components/brand/foundation-proof";
import { getActiveTenant } from "@/application/use-cases/tenant/get-active-tenant";
import { directionFor, isLocale } from "@/i18n/routing";

/**
 * The foundation demo route.
 *
 * This exists to prove Phase 0 works, and it will be replaced by the real
 * homepage in Phase 3. It demonstrates, on one page: tokens applied, all five
 * fonts loaded, locale switching, RTL mirroring, the single focus treatment, and
 * a live Prisma read of the seeded tenant.
 *
 * Rendered dynamically so `pnpm build` never needs a database — the tenant read
 * would otherwise run at build time and fail on any machine without one.
 */
export const dynamic = "force-dynamic";

export default async function FoundationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("foundation");

  // Read through the application layer, which calls a repository that returns a
  // DOMAIN type. No Prisma type reaches this component — the ESLint boundary
  // rule would fail the build if one tried to.
  const { tenant, error } = await getActiveTenant();

  return (
    <main id="main" className="min-h-dvh">
      <header className="border-b border-border px-gutter py-6">
        <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-4">
          <p className="text-caption text-stone-600">{t("eyebrow")}</p>
          <LocaleSwitcher />
        </div>
      </header>

      <FoundationProof
        locale={locale}
        direction={directionFor(locale)}
        tenant={tenant}
        tenantError={error}
      />
    </main>
  );
}
