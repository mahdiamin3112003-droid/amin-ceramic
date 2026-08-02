import { setRequestLocale } from "next-intl/server";

import { isLocale } from "@/i18n/routing";
import { notFound } from "next/navigation";

// Placeholder — replaced by the foundation demo route in step 9.
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  return <main id="main" />;
}
