import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";

/**
 * `/basket/request/sent/[ref]` — the confirmation page. No `get-quote-by-reference`
 * read exists yet (that's an account-holder concern, out of Phase 2's
 * visitor-only scope), so this renders the reference from the URL plus
 * static confirmation copy rather than re-fetching the submission.
 *
 * `wa` carries the WhatsApp deep link built server-side by
 * `submitQuoteRequest` — passed through the client navigation that lands
 * here, since this page itself has no submission to re-derive it from.
 * Restricted to `https://wa.me/` even though the value is our own server's
 * output, not user input: defense in depth against a hand-edited URL.
 */
export const dynamic = "force-dynamic";

export default async function QuoteRequestSentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; ref: string }>;
  searchParams: Promise<{ wa?: string }>;
}) {
  const { locale, ref } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("quote.sent");
  const { wa } = await searchParams;
  const whatsappLink = wa?.startsWith("https://wa.me/") ? wa : null;

  return (
    <main id="main" className="mx-auto max-w-content px-gutter py-16 text-center">
      <h1 className="mb-4 font-display text-display-md">{t("title")}</h1>
      <p className="mb-2 text-body text-stone-600">{t("body")}</p>
      <p className="mb-8 text-heading-sm">
        {t("reference")}: <span className="text-spec">{ref}</span>
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/products" className={buttonVariants({ variant: "primary" })}>
          {t("continueShopping")}
        </Link>
        {whatsappLink ? (
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "secondary" })}
          >
            {t("whatsappButton")}
          </a>
        ) : null}
      </div>
    </main>
  );
}
