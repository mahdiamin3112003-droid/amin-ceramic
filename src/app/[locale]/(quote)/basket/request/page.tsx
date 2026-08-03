import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { QuoteRequestForm } from "@/components/quote/quote-request-form";
import { isLocale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

export default async function QuoteRequestPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("quote.request");

  return (
    <main id="main" className="mx-auto max-w-content px-gutter py-8">
      <h1 className="mb-2 font-display text-display-md">{t("title")}</h1>
      <p className="mb-8 max-w-prose text-body-sm text-stone-600">
        {t("subtitle")}
      </p>
      <QuoteRequestForm />
    </main>
  );
}
