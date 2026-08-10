"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { WishlistButton } from "@/components/catalog/wishlist-button";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { ProductSummary, StockStatus } from "@/domain/product/entity";

/**
 * The catalogue page-turn view — docs/02 §8.3 item 15 ("Showroom mode"),
 * pulled forward; see ADR-0017.
 *
 * ── Why a turn is honest here and nowhere else ──
 * §5.7: "No slide — slide implies sequence, and gallery images are
 * alternatives, not a sequence." A filtered result set is alternatives; a
 * COLLECTION is a curated, ordered, finite set. That is the one place a
 * page-turn tells the truth, which is why this view lives under
 * `/collections/[slug]` and not on `/products`.
 *
 * ── Why the turn is a 45° wipe and not a page curl ──
 * §8.5 rejects "3D tile rotation viewers … effort spent proving we own a 3D
 * library", and §5.6 rejects 3D tilt because it makes a flat material read
 * as floating plastic. A skeuomorphic curling page is the same mistake in
 * different clothes. Motion principle #4 — "the diagonal is the brand's
 * motion axis" — gives the correct treatment, and it is the same wipe the
 * public page transition already uses (§5.10).
 */

const STOCK_BADGE_VARIANT: Record<
  StockStatus,
  "inStock" | "lowStock" | "outOfStock"
> = {
  in_stock: "inStock",
  low_stock: "lowStock",
  out_of_stock: "outOfStock",
  on_order: "outOfStock",
};

/**
 * The wipe geometry. Four points each so Framer can interpolate between
 * them; the 35% horizontal offset between the top and bottom edge is what
 * makes the travelling edge read as 45°.
 */
const CLIP_OPEN = "polygon(-50% 0, 150% 0, 150% 100%, -50% 100%)";
const CLIP_CLOSED_END = "polygon(135% 0, 150% 0, 150% 100%, 100% 100%)";
const CLIP_CLOSED_START = "polygon(-50% 0, -35% 0, 0 100%, -50% 100%)";

/**
 * 320ms for the wipe in.
 *
 * Matches §5.7's full-screen gallery slide rather than §5.10's 380ms page
 * wipe: this is a repeated interaction, and §5.1 rule 5 is explicit that
 * users repeat these dozens of times per session. There is no separate exit
 * duration because there is no exit animation — see the note on the motion
 * element below.
 */
const ENTER_MS = 0.32;
const REDUCED_MS = 0.12; // §5.12: page wipe → "120ms opacity"

/** §5.7's full-screen gallery: "12% velocity-following drag … snap on release". */
const DRAG_ELASTIC = 0.12;
const SWIPE_DISTANCE_PX = 60;
const SWIPE_VELOCITY = 400;

export function CatalogueView({
  products,
  collectionSlug,
  collectionName,
  initialIndex,
  wishlistedIds,
  isRtl,
}: {
  products: readonly ProductSummary[];
  collectionSlug: string;
  collectionName: string;
  initialIndex: number;
  wishlistedIds: ReadonlySet<string>;
  isRtl: boolean;
}) {
  const t = useTranslations("catalogue");
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();

  const [index, setIndex] = useState(initialIndex);
  const [direction, setDirection] = useState(0);
  const [economise, setEconomise] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const indexRef = useRef(initialIndex);
  // Suppresses the focus move on first paint — focus should only follow a
  // turn the visitor actually made (§7.1: focus is never lost, never stolen).
  const hasTurned = useRef(false);

  /**
   * Same constrained-device gate the intro uses (§5.2): saveData, 2g, or a
   * low-memory device drops the wipe. This view is image-dominant, so it
   * matters more here than anywhere else on the site.
   */
  useEffect(() => {
    const connection = (
      navigator as Navigator & {
        connection?: {
          saveData?: boolean;
          effectiveType?: string;
        };
      }
    ).connection;
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number })
      .deviceMemory;
    setEconomise(
      connection?.saveData === true ||
        connection?.effectiveType === "2g" ||
        connection?.effectiveType === "slow-2g" ||
        (deviceMemory !== undefined && deviceMemory < 4),
    );
  }, []);

  const still = Boolean(prefersReducedMotion) || economise;
  const total = products.length;
  const product = products[index];

  const goTo = useCallback(
    (next: number, from: number) => {
      if (next < 0 || next >= total || next === from) return;
      const target = products[next];
      if (!target) return;

      hasTurned.current = true;
      setDirection(next > from ? 1 : -1);
      setIndex(next);

      /**
       * `pushState`, not a router navigation. Each turn becomes its own
       * history entry so Back steps back exactly one page — the behaviour
       * §3.2 protects when it rejects infinite scroll — without a server
       * round trip on a `force-dynamic` route.
       */
      const url = new URL(window.location.href);
      url.searchParams.set("tile", target.slug);
      window.history.pushState(null, "", url);
    },
    [products, total],
  );

  // Back/forward must move the page, not leave the URL and the view disagreeing.
  useEffect(() => {
    function onPopState() {
      const slug = new URLSearchParams(window.location.search).get("tile");
      const found = products.findIndex((p) => p.slug === slug);
      if (found >= 0) {
        setDirection(0);
        setIndex(found);
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [products]);

  useEffect(() => {
    indexRef.current = index;
    if (hasTurned.current) headingRef.current?.focus();
  }, [index]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // In RTL the visually-forward key is ArrowLeft — the page turns the
      // way the language reads, which is the whole point of a book in Arabic.
      const forward = isRtl ? "ArrowLeft" : "ArrowRight";
      const back = isRtl ? "ArrowRight" : "ArrowLeft";

      // `indexRef`, not a state updater: running `goTo` inside `setIndex`
      // makes it a side effect in a reducer, which React is free to invoke
      // twice. The ref carries the current page without that hazard.
      const current = indexRef.current;
      if (event.key === forward) goTo(current + 1, current);
      else if (event.key === back) goTo(current - 1, current);
      else if (event.key === "Home") goTo(0, current);
      else if (event.key === "End") goTo(total - 1, current);
      // Escape leaves, the same way it closes the gallery (§7.1). The close
      // control scrolls with the page, so this is the reliable way out.
      else if (event.key === "Escape")
        router.push(`/collections/${collectionSlug}`);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [goTo, isRtl, total, router, collectionSlug]);

  if (!product) {
    return (
      <div className="py-24 text-center">
        <p className="mb-6 text-body text-stone-600">{t("empty")}</p>
        <Link
          href={`/collections/${collectionSlug}`}
          className={buttonVariants({ variant: "primary" })}
        >
          {t("exit")}
        </Link>
      </div>
    );
  }

  // Physical, because clip-path percentages are. Mirrored under RTL so the
  // wipe always travels the same way the reader does.
  const enterFrom =
    direction === 0
      ? CLIP_OPEN
      : direction > 0 !== isRtl
        ? CLIP_CLOSED_END
        : CLIP_CLOSED_START;

  const facts: readonly { label: string; value: string }[] = [
    {
      label: t("facts.format"),
      value:
        product.nominalFormat ??
        `${String(product.widthMm)} × ${String(product.heightMm)} mm`,
    },
    { label: t("facts.thickness"), value: `${String(product.thicknessMm)} mm` },
    { label: t("facts.finish"), value: product.finish.label },
    {
      label: t("facts.suitableFor"),
      value:
        product.isIndoor && product.isOutdoor
          ? t("facts.both")
          : product.isOutdoor
            ? t("facts.outdoorOnly")
            : t("facts.indoorOnly"),
    },
  ];

  return (
    /*
      Normal flow with STICKY controls, not a fixed full-screen overlay.
      §8.3 item 15 and §6.3 describe this view as having "no navigation
      chrome"; that chrome-less shell is deferred, and this is why.

      `fixed inset-0 z-50` was tried and cannot work from here. The
      `[locale]/template.tsx` page-transition wrapper carries a `clip-path`,
      which creates both a stacking context and a containing block for fixed
      descendants — so the overlay was positioned against that wrapper and
      its z-index was trapped inside it. Hit-testing showed the site FOOTER
      painting over the Next control and the sticky header (`z-30`) over the
      close control, with `z-50` powerless against either.

      A portal to `document.body` would escape it, at the cost of no longer
      server-rendering the page content — a bad trade for a content view.
      Sticky controls keep every control reachable at any scroll position
      with no stacking games, and leave §7.5's reflow behaviour intact.
    */
    <div className="flex min-h-dvh flex-col bg-background">
      {/* ── Chrome: position, and the way out ─────────────────────────── */}
      <div className="flex items-center justify-between gap-4 border-b border-border px-gutter py-4">
        <p className="text-caption tracking-widest text-stone-600 uppercase">
          {collectionName}
        </p>
        <div className="flex items-center gap-4">
          <p className="text-spec-sm text-stone-600 tabular-nums">
            {t("position", { current: index + 1, total })}
          </p>
          <Link
            href={`/collections/${collectionSlug}`}
            aria-label={t("exit")}
            className="flex size-11 items-center justify-center rounded-full text-stone-600 hover:bg-stone-50"
          >
            <X className="size-5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {/*
        The announcement, not the visual position, is what a screen-reader
        user navigates by — §7.2's precedent is the filter count announcing
        "34 products match."
      */}
      <p aria-live="polite" className="sr-only">
        {t("announce", { current: index + 1, total, name: product.name })}
      </p>

      {/*
        `min-h-0` is load-bearing. A flex item defaults to `min-height: auto`,
        so `flex-1` alone cannot shrink below its content — the page grew past
        its share and sat on top of the turn controls, which hit-tested as the
        text column covering the Next button. `min-h-0` lets it shrink and
        hands the overflow to the article's own scroll.
      */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/*
          No `AnimatePresence`. It was tried and it stalled: the outgoing
          page reached its exit clip-path and was then never unmounted, so
          the incoming page never mounted at all — the counter and the live
          region advanced while the visible page stayed behind. Caught in a
          real browser by reading the wrapper's computed `clip-path` and
          finding it parked on CLIP_CLOSED_END.

          Remounting on `key` gives the same read — a 45° edge wiping the
          new page in — with no exit/unmount handshake to get wrong. §5.10
          describes the incoming half as the visible one anyway.
        */}
        <motion.div
          key={product.id}
          /**
           * Both paths settle `clipPath` at CLIP_OPEN, and the reduced path
           * starts there too. That invariant is deliberate: branching into
           * two motion elements with different property sets is what left
           * the whole public site clipped to nothing for reduced-motion
           * visitors earlier (see `[locale]/template.tsx`). Every property
           * one path can set, the other must also settle.
           */
          initial={{
            clipPath: still ? CLIP_OPEN : enterFrom,
            opacity: still ? 0 : 1,
          }}
          animate={{
            clipPath: CLIP_OPEN,
            opacity: 1,
            transition: {
              duration: still ? REDUCED_MS : ENTER_MS,
              ease: still ? "linear" : [0.76, 0, 0.24, 1], // ease-in-out-quart: two-way wipes
            },
          }}
          drag="x"
          dragElastic={DRAG_ELASTIC}
          dragConstraints={{ left: 0, right: 0 }}
          onDragEnd={(_, info) => {
            const past =
              Math.abs(info.offset.x) > SWIPE_DISTANCE_PX ||
              Math.abs(info.velocity.x) > SWIPE_VELOCITY;
            if (!past) return;
            // Dragging content leftwards asks for what is to its right.
            const wantsNext = isRtl ? info.offset.x > 0 : info.offset.x < 0;
            goTo(wantsNext ? index + 1 : index - 1, index);
          }}
          className="h-full"
        >
          <CataloguePage
            product={product}
            facts={facts}
            headingRef={headingRef}
            isWishlisted={wishlistedIds.has(product.id)}
          />
        </motion.div>
      </div>

      {/* ── Turn controls — sticky, so a turn is always one reach away ── */}
      <div className="sticky bottom-0 z-10 flex items-center justify-between gap-4 border-t border-border bg-background px-gutter py-4">
        <button
          type="button"
          onClick={() => {
            goTo(index - 1, index);
          }}
          disabled={index === 0}
          aria-label={t("previous")}
          className={turnButton}
        >
          <ArrowLeft className="size-5 rtl:rotate-180" aria-hidden="true" />
        </button>

        <p className="text-caption text-stone-500">{t("hint")}</p>

        <button
          type="button"
          onClick={() => {
            goTo(index + 1, index);
          }}
          disabled={index === total - 1}
          aria-label={t("next")}
          className={turnButton}
        >
          <ArrowRight className="size-5 rtl:rotate-180" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** 44×44 with the house focus ring, per §6.5 and §7.4. */
const turnButton = cn(
  "flex size-11 items-center justify-center rounded-full border border-border",
  "text-stone-800 transition-surface duration-instant ease-material",
  "hover:bg-stone-50 disabled:pointer-events-none disabled:opacity-40",
);

/**
 * One catalogue page.
 *
 * DELIBERATELY the product detail page's decision block (§3.3 items 1–5,
 * "the five facts that decide it") at presentation scale — not the whole
 * PDP. Page-turning into a twelve-section scrolling document with three
 * recommendation rails breaks the metaphor on the first turn. Everything
 * past the decision is one tap away behind "Full details".
 */
function CataloguePage({
  product,
  facts,
  headingRef,
  isWishlisted,
}: {
  product: ProductSummary;
  facts: readonly { label: string; value: string }[];
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  isWishlisted: boolean;
}) {
  const t = useTranslations("catalogue");
  const card = useTranslations("catalog.card");

  return (
    <article className="mx-auto grid h-full max-w-content gap-8 overflow-y-auto px-gutter py-8 lg:grid-cols-[55%_1fr] lg:items-center">
      {/* §3.3: the image dominates, 55/45. Token-derived placeholder until
          the client's photography lands — the same honest stand-in the
          product card uses, so nothing about this layout changes later. */}
      <div
        className="aspect-[4/3] w-full rounded-md bg-stone-100 lg:aspect-auto lg:h-[min(68dvh,40rem)]"
        style={{ backgroundColor: product.colorHex ?? undefined }}
        aria-hidden="true"
      />

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <p className="text-caption tracking-widest text-stone-600 uppercase">
            {product.brand.label}
          </p>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-display-sm font-display focus-visible:outline-none"
          >
            {product.name}
          </h1>
          <p className="text-spec text-stone-600">
            {product.sku} · {product.material.label}
          </p>
        </div>

        <p className="text-heading-md">
          {product.basePrice !== null
            ? `${product.currency} ${product.basePrice.toFixed(2)}/m²`
            : card("priceOnRequest")}
        </p>

        <dl className="grid grid-cols-2 gap-4 border-y border-border py-5 text-body-sm">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt className="text-stone-600">{fact.label}</dt>
              <dd className="mt-0.5">{fact.value}</dd>
            </div>
          ))}
        </dl>

        <Badge variant={STOCK_BADGE_VARIANT[product.stockStatus]}>
          {card(`stock.${product.stockStatus}`)}
        </Badge>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/products/${product.slug}`}
            className={buttonVariants({ variant: "primary" })}
          >
            {t("fullDetails")}
          </Link>
          <WishlistButton
            productId={product.id}
            initialWishlisted={isWishlisted}
            className="border border-border"
          />
        </div>
      </div>
    </article>
  );
}
