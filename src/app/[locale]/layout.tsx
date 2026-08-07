import type { Metadata } from "next";
import type { ReactNode } from "react";

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Toaster } from "@/components/ui/sonner";
import { CompareProvider } from "@/components/catalog/compare-context";
import { CompareTray } from "@/components/catalog/compare-tray";
import { AssemblyIntro } from "@/components/motion/assembly-intro";
import { IntroGate } from "@/components/motion/intro-gate";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getBasket } from "@/application/use-cases/quote/get-basket";
import { listWishlistProductIds } from "@/application/use-cases/quote/wishlist";
import { basketItemCount } from "@/domain/quote/entity";
import { directionFor, localeHtmlLang, routing } from "@/i18n/routing";
import { fontVariables } from "@/lib/fonts";
import { alternatesFor, canonicalFor, siteUrl } from "@/lib/seo/site";

import "../globals.css";

interface LocaleLayoutProps {
  children: ReactNode;
  /** Next 15 hands route params to layouts as a Promise. */
  params: Promise<{ locale: string }>;
}

/** Both locales are known at build time, so both prerender. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: Omit<LocaleLayoutProps, "children">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const t = await getTranslations({ locale, namespace: "meta" });

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: t("title"),
      template: t("titleTemplate", { page: "%s" }),
    },
    description: t("description"),
    alternates: {
      ...alternatesFor("/"),
      canonical: canonicalFor(locale, "/"),
    },
    openGraph: {
      type: "website",
      locale,
      siteName: t("title"),
      title: t("title"),
      description: t("description"),
      url: canonicalFor(locale, "/"),
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Opts this subtree into static rendering; without it every page using
  // translations becomes dynamic.
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "common" });

  // Stamped by the middleware. Read here rather than inside IntroGate so the
  // dynamic dependency is visible at the layout level.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  // Sequential, not Promise.all — RUNTIME_DATABASE_URL is a connection_limit=1
  // pooler and each of these opens its own withRequestContext transaction
  // (same constraint documented on the /products page).
  const { productIds: wishlistedIds } = await listWishlistProductIds();
  const { basket } = await getBasket();

  return (
    <html
      lang={localeHtmlLang[locale]}
      dir={directionFor(locale)}
      className={fontVariables}
      suppressHydrationWarning
    >
      <head>
        {/* Must run during HTML parse, before the first paint — see the
            component's own note on why this cannot be a React effect.
            The nonce is what lets it past the CSP (docs/04 §24.1). */}
        <IntroGate nonce={nonce} />
      </head>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <NextIntlClientProvider>
          {/* Skip link — docs/02-ux-blueprint.md §7.1. Visible on focus only. */}
          <a
            href="#main"
            className="sr-only rounded-md bg-primary px-4 py-2 text-body-sm text-primary-foreground focus:not-sr-only focus:absolute focus:z-50 focus:m-4 focus:ring-offset-background"
          >
            {t("skipToContent")}
          </a>
          {/* CompareProvider wraps the whole locale subtree, not just the
              catalog routes: any page that renders a ProductCard carries the
              compare toggle, and that now includes the homepage's in-stock
              rail and the collection detail page. */}
          <CompareProvider>
            {/* The whole site lives inside #site-shell so the intro can hold
                it back and then fade it in as one piece. */}
            <div id="site-shell" className="flex min-h-dvh flex-col">
              <SiteHeader
                wishlistCount={wishlistedIds.length}
                basketCount={basket ? basketItemCount(basket) : 0}
              />
              <div className="flex-1">{children}</div>
              <SiteFooter />
            </div>
            <CompareTray />
          </CompareProvider>
          {/* Outside the shell — it must stay visible while the shell is held. */}
          <AssemblyIntro skipLabel={t("skipIntro")} />
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
