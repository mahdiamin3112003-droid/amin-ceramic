"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

import { Diamond } from "@/components/brand/diamond";
import { MarbleSurface } from "@/components/brand/marble-surface";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * The hero — docs/02-ux-blueprint.md §3.1 and §5.3.
 *
 * Full-bleed surface, then type. §5.3's rules, all of them:
 *  - the headline reveals by a 45° CLIP-PATH WIPE, not a fade, and never
 *    word-by-word ("that's the AI-generated tell");
 *  - the background scales 1.06 → 1.0 over 1.2s on load, then parallaxes at
 *    0.4× scroll rate capped at 120px;
 *  - content staggers headline → subhead → buttons → indicator at 90ms;
 *  - the scroll indicator traces itself and retires permanently on first
 *    scroll input.
 *
 * The surface is `MarbleSurface` — generated, not photographed, because
 * there is no photography yet. It is deliberately the only thing that would
 * need to change when there is.
 */
export function Hero({
  title,
  lede,
  ctaLabel,
  secondaryCtaLabel,
  scrollHint,
  eyebrow,
}: {
  title: string;
  lede: string;
  ctaLabel: string;
  secondaryCtaLabel: string;
  scrollHint: string;
  eyebrow: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);

  // Entrance gate. While the Assembly intro owns the screen, the hero holds
  // its `initial` state; the intro dispatches `ac:intro-handoff` at the
  // moment its mark starts flying to the navbar, and the hero rises THEN —
  // docs/01 §4.2 t=3.9: "Simultaneously the hero content beneath
  // cross-fades up." When there is no intro (every other visit, reduced
  // motion, non-home routes), this flips true on mount and the entrance
  // plays immediately, exactly as before.
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (document.documentElement.getAttribute("data-intro") !== "playing") {
      setGo(true);
      return;
    }
    function onHandoff() {
      setGo(true);
    }
    window.addEventListener("ac:intro-handoff", onHandoff, { once: true });
    return () => {
      window.removeEventListener("ac:intro-handoff", onHandoff);
    };
  }, []);

  const { scrollY } = useScroll();
  const parallax = useTransform(scrollY, [0, 900], [0, 120]);
  const surfaceY = prefersReducedMotion ? 0 : parallax;

  useEffect(() => {
    function onScroll() {
      if (window.scrollY > 24) setScrolled(true);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Stagger per §5.3: headline → subhead → buttons → indicator, 90ms apart.
  // `animate: undefined` (pre-handoff) keeps Framer parked on `initial`.
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: prefersReducedMotion ? 0 : 24 },
    animate: go ? { opacity: 1, y: 0 } : undefined,
    transition: {
      duration: prefersReducedMotion ? 0.2 : 0.7,
      delay: prefersReducedMotion ? 0 : delay,
      ease: [0.25, 1, 0.5, 1] as const,
    },
  });

  return (
    <section
      ref={sectionRef}
      className="relative isolate flex min-h-[92svh] items-center overflow-hidden"
    >
      {/* Surface: settles from 1.06 → 1.0 on reveal, then parallaxes.
          Opacity is NEVER animated here — the marble paints at full opacity
          from first render (beneath the intro overlay when one is playing),
          which is what keeps it the LCP element. */}
      <motion.div
        className="absolute inset-0 -z-10"
        style={{ y: surfaceY }}
        initial={{ scale: prefersReducedMotion ? 1 : 1.06 }}
        animate={go ? { scale: 1 } : undefined}
        transition={{
          duration: prefersReducedMotion ? 0 : 1.2,
          ease: [0.32, 0.72, 0, 1],
        }}
      >
        <MarbleSurface className="absolute inset-0" />
      </motion.div>

      {/* Contrast floor. Not decoration: the marble's bright vein filaments
          reach ~rgb(113,146,185) at their lightest, and type cannot sit on a
          surface whose luminance varies per-pixel. navy-950 at 0.62 puts the
          worst case at 7.3:1 for cyan-100 and 9.7:1 for white — measured
          against the lightest vein, not the base colour. */}
      <div className="absolute inset-0 -z-10 bg-navy-950/62" aria-hidden="true" />

      <div className="mx-auto w-full max-w-content px-gutter py-28 sm:py-36">
        <div className="max-w-[46rem]">
          <motion.p
            {...rise(0)}
            // eslint-disable-next-line amin/no-cyan-text -- on the navy-950/62 scrim: 7.3:1 worst case, measured against the marble's lightest vein
            className="mb-7 flex items-center gap-4 text-caption tracking-[0.4em] text-cyan-100 uppercase"
          >
            {/* The rule draws itself in, left to right, as the eyebrow settles. */}
            <motion.span
              className="block h-px bg-cyan-400"
              aria-hidden="true"
              initial={{ width: 0 }}
              animate={go ? { width: 44 } : undefined}
              transition={{
                duration: prefersReducedMotion ? 0 : 0.8,
                delay: prefersReducedMotion ? 0 : 0.2,
                ease: [0.32, 0.72, 0, 1],
              }}
            />
            {eyebrow}
          </motion.p>

          {/* 45° clip-path wipe — §5.3. The whole line at once. */}
          <motion.h1
            // `text-balance` stops the last line orphaning a single word —
            // the difference between a set headline and a wrapped one.
            className="font-display text-display-xl text-balance text-white"
            initial={{
              clipPath: prefersReducedMotion
                ? "polygon(0 0, 100% 0, 100% 100%, 0 100%)"
                : "polygon(0 0, 0 0, -28% 100%, 0 100%)",
              opacity: prefersReducedMotion ? 0 : 1,
            }}
            animate={
              go
                ? {
                    clipPath: "polygon(0 0, 128% 0, 100% 100%, 0 100%)",
                    opacity: 1,
                  }
                : undefined
            }
            transition={{
              duration: prefersReducedMotion ? 0.3 : 1.1,
              delay: prefersReducedMotion ? 0 : 0.15,
              ease: [0.76, 0, 0.24, 1],
            }}
          >
            {title}
          </motion.h1>

          <motion.p
            {...rise(0.42)}
            // 58ch, not 46: at display-xl the headline runs wide, and a
            // narrow lede beneath it reads as a column pinched to nothing.
            // eslint-disable-next-line amin/no-cyan-text -- same navy-950/62 scrim, 7.3:1 worst case
            className="mt-7 max-w-[58ch] text-body-lg leading-[1.75] text-cyan-100"
          >
            {lede}
          </motion.p>

          <motion.div
            {...rise(0.51)}
            className="mt-11 flex flex-wrap items-center gap-3"
          >
            <Link
              href="/products"
              className={buttonVariants({ variant: "primary", size: "lg" })}
            >
              {ctaLabel}
            </Link>
            <Link
              href="/collections"
              className={cn(
                buttonVariants({ variant: "ghost", size: "lg" }),
                "border border-cyan-400/40 text-white hover:bg-white/10",
              )}
            >
              {secondaryCtaLabel}
            </Link>
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator — traces its own outline, retires on first scroll. */}
      <motion.div
        aria-hidden="true"
        className="inset-inline-0 absolute bottom-8 flex justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: scrolled || !go ? 0 : 1 }}
        transition={{ duration: 0.6, delay: scrolled ? 0 : 0.9 }}
      >
        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line amin/no-cyan-text -- same navy-950/62 scrim, 7.3:1 worst case */}
          <span className="text-caption tracking-[0.28em] text-cyan-100 uppercase">
            {scrollHint}
          </span>
          <motion.span
            animate={prefersReducedMotion ? undefined : { y: [0, 7, 0] }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              ease: [0.76, 0, 0.24, 1],
            }}
          >
            {/* eslint-disable-next-line amin/no-cyan-text -- not text: a decorative aria-hidden stroke, which §4.1 explicitly permits cyan for. 4.9:1 here, past the 3:1 WCAG 1.4.11 bar for non-text graphics. */}
            <Diamond variant="outline" className="size-4 text-cyan-400" />
          </motion.span>
        </div>
      </motion.div>
    </section>
  );
}
