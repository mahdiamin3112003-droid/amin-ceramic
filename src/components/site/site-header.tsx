"use client";

import { useEffect, useState } from "react";
import { Heart, Menu, Search, ShoppingBag, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Logo } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/brand/locale-switcher";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Sticky global nav — docs/02-ux-blueprint.md §3.1: "sticky, transparent →
 * solid on scroll". Links only to routes that exist after this phase
 * (Products, Collections, Search, Basket) — the wireframe also lists
 * Looks/Spaces/Projects, none of which are built yet (see the Phase 3
 * plan's "Out" section), so they're omitted rather than left as dead links.
 *
 * `wishlistCount`/`basketCount` are read server-side (DB-backed) by the
 * layout that renders this and passed down as props — this component itself
 * has no data access, only presentation and scroll/menu interaction state.
 */
export function SiteHeader({
  wishlistCount,
  basketCount,
}: {
  wishlistCount: number;
  basketCount: number;
}) {
  const t = useTranslations("nav");
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const navLinks = [
    { href: "/products" as const, label: t("products") },
    { href: "/collections" as const, label: t("collections") },
  ];

  return (
    <header
      className={cn(
        "sticky top-0 z-30 transition-[background-color,box-shadow,border-color] duration-quick ease-material",
        scrolled
          ? "border-b border-border bg-background/95 backdrop-blur-sm"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex max-w-content items-center justify-between gap-4 px-gutter py-3">
        <Link
          href="/"
          className="flex items-center gap-2 focus-visible:outline-none"
          aria-label={t("home")}
        >
          {/* `shrink-0`: without it flexbox squeezes the mark to make room
              for the wordmark — measured 25.4px instead of 32 at 375px,
              which also shrinks the intro's docking target. */}
          <Logo id="site-logo-mark" className="size-8 shrink-0" />
          <span className="font-display text-heading-sm tracking-[0.06em] whitespace-nowrap uppercase">
            Amin Ceramic
          </span>
        </Link>

        <nav
          aria-label={t("primary")}
          className="hidden items-center gap-6 md:flex"
        >
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-body-sm text-foreground transition-surface duration-instant hover:text-primary"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <Link
            href="/search"
            aria-label={t("search")}
            className="flex size-11 items-center justify-center rounded-full text-foreground hover:bg-muted"
          >
            <Search className="size-5" aria-hidden="true" />
          </Link>
          <LocaleSwitcher className="hidden sm:flex" />
          <Link
            href="/wishlist"
            aria-label={t("wishlistCount", { count: wishlistCount })}
            className="relative flex size-11 items-center justify-center rounded-full text-foreground hover:bg-muted"
          >
            <Heart className="size-5" aria-hidden="true" />
            {wishlistCount > 0 ? (
              <span className="absolute end-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground tabular-nums">
                {wishlistCount}
              </span>
            ) : null}
          </Link>
          <Link
            href="/basket"
            aria-label={t("basketCount", { count: basketCount })}
            className="relative flex size-11 items-center justify-center rounded-full text-foreground hover:bg-muted"
          >
            <ShoppingBag className="size-5" aria-hidden="true" />
            {basketCount > 0 ? (
              <span className="absolute end-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground tabular-nums">
                {basketCount}
              </span>
            ) : null}
          </Link>
          <button
            type="button"
            aria-label={menuOpen ? t("closeMenu") : t("openMenu")}
            aria-expanded={menuOpen}
            onClick={() => {
              setMenuOpen((v) => !v);
            }}
            className="flex size-11 items-center justify-center rounded-full text-foreground hover:bg-muted md:hidden"
          >
            {menuOpen ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <nav
          aria-label={t("primary")}
          className="flex flex-col gap-1 border-t border-border px-gutter py-3 md:hidden"
        >
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => {
                setMenuOpen(false);
              }}
              className="rounded-md px-3 py-2 text-body-sm text-foreground hover:bg-muted"
            >
              {link.label}
            </Link>
          ))}
          <div className="px-3 py-2">
            <LocaleSwitcher />
          </div>
        </nav>
      ) : null}
    </header>
  );
}
