import { useTranslations } from "next-intl";

import { Logo } from "@/components/brand/logo";
import { Link } from "@/i18n/navigation";

/**
 * docs/02-ux-blueprint.md §3.1's footer lists catalog/collections/trade/
 * showrooms/legal plus social links. Only `Products`, `Collections`,
 * `Basket` and `Wishlist` are real routes after this phase — trade,
 * showrooms-as-a-page, and legal pages aren't built (Phase 3 plan's "Out"
 * list), so the footer links only to what exists rather than guessing at
 * a WhatsApp/Instagram URL that isn't the client's own.
 */
export function SiteFooter() {
  const t = useTranslations("footer");

  const links = [
    { href: "/products" as const, label: t("products") },
    { href: "/collections" as const, label: t("collections") },
    { href: "/basket" as const, label: t("basket") },
    { href: "/wishlist" as const, label: t("wishlist") },
  ];

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-content flex-col gap-6 px-gutter py-10 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 focus-visible:outline-none"
        >
          <Logo className="size-6" />
          <span className="font-display text-body-lg tracking-wide uppercase">
            Amin Ceramic
          </span>
        </Link>

        <nav aria-label={t("label")} className="flex flex-wrap gap-x-6 gap-y-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-body-sm text-stone-600 hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <p className="text-caption text-stone-600">
          {t("copyright", { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
}
