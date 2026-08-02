import type { Metadata } from "next";
import type { ReactNode } from "react";

import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

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

  return (
    <html
      lang={localeHtmlLang[locale]}
      dir={directionFor(locale)}
      className={fontVariables}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <NextIntlClientProvider>
          {/* Skip link — docs/02-ux-blueprint.md §7.1. Visible on focus only. */}
          <a
            href="#main"
            className="sr-only rounded-md bg-primary px-4 py-2 text-body-sm text-primary-foreground focus:not-sr-only focus:absolute focus:z-50 focus:m-4 focus:ring-offset-background"
          >
            {t("skipToContent")}
          </a>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
