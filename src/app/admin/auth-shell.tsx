import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { TileWall } from "@/components/brand/tile-wall";

/**
 * Frame for the three unauthenticated admin screens.
 *
 * ── The composition ──
 * The ceramic wall runs FULL-BLEED behind everything, and the card floats
 * on it as frosted glass. That is the difference between this and a
 * split-screen: in a split, the form half is a separate white panel and the
 * imagery is decoration beside it. Here there is one surface and the card
 * is made of it — which is what makes the glass mean something, because
 * there is real material behind it to blur.
 *
 * On desktop the card sits in the inline-end column and the brand statement
 * holds the start column, so the eye lands on the wordmark, crosses the
 * wall, and arrives at the fields. Dead-centre is the generic choice and
 * wastes the surface.
 *
 * Below `lg` the statement is dropped rather than stacked. A luxury layout
 * that becomes a long scroll on a phone is no longer one, and the card is
 * the only thing a person on a phone came here to use.
 *
 * ── Depth ──
 * Three planes, not two: the wall, a darkening scrim that guarantees text
 * contrast whatever tones the wall happens to land on, and the card. The
 * card's shadow is deliberately large and soft rather than tight — tight
 * shadows read as Material buttons, wide ones read as a heavy object
 * resting on stone.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
  eyebrow,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Small label above the heading — the screen's place in the flow. */
  eyebrow?: string;
}) {
  return (
    <div className="relative isolate min-h-dvh overflow-hidden bg-navy-950">
      <TileWall className="-z-20" />

      {/* Scrim. Diagonal so the inline-end side — where the card sits — is
          darkest, which is what lets the glass read as glass rather than as
          a grey rectangle. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-linear-to-br from-navy-950/35 via-navy-950/15 to-navy-950/60"
      />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-content flex-col px-gutter py-8 lg:py-12">
        {/* ── Masthead ──────────────────────────────────────────────── */}
        <header
          className="flex items-center gap-5 lg:gap-6"
          style={{
            animation: "fade-in var(--duration-base) var(--ease-material) both",
            animationDelay: "220ms",
          }}
        >
          {/* The mark sits in its own halo. `isolate` so the glow's blend
              cannot reach the wall behind it. */}
          <span className="relative isolate grid shrink-0 place-items-center">
            <span
              aria-hidden
              className="pointer-events-none absolute -z-10 size-[150%] rounded-full bg-cyan-400/30 blur-2xl"
              style={{
                animation: "logo-breathe 14s var(--ease-material) 1s infinite",
              }}
            />
            <Logo className="size-16 drop-shadow-[0_6px_20px_rgb(6_10_32/0.7)] lg:size-20" />
          </span>
          <span aria-hidden className="h-12 w-px bg-white/25 lg:h-16" />
          <span className="flex flex-col gap-1.5">
            <span className="font-display text-heading-md leading-none tracking-[0.3em] text-white uppercase lg:text-heading-lg">
              Amin Ceramic
            </span>
            {/* eslint-disable-next-line amin/no-cyan-text -- on the navy-950
                wall behind a darkening scrim, never on a light surface. */}
            <span className="text-caption tracking-[0.24em] text-cyan-100/85 uppercase">
              Back office
            </span>
          </span>
        </header>

        {/* ── Body ──────────────────────────────────────────────────────
            `<main>`, not a div: the page had `<header>` and `<footer>` but no
            main landmark, so a screen-reader user skipping by landmark had no
            way to jump to the actual form. */}
        <main className="flex flex-1 items-center py-12 lg:py-16">
          <div className="grid w-full items-center gap-12 lg:grid-cols-[1fr_minmax(0,27rem)] lg:gap-16">
            {/* Statement — desktop only, see the note above. */}
            <div
              className="hidden lg:block"
              style={{
                animation:
                  "slide-in-block-end var(--duration-slow) var(--ease-material) both",
                animationDelay: "600ms",
              }}
            >
              <p className="max-w-lg font-display text-display-md leading-[1.05] text-balance text-white">
                A catalogue built on surface, tone and light.
              </p>
              <p className="mt-6 max-w-md text-body-lg leading-relaxed text-white/75">
                Porcelain and ceramic, specified for the projects that outlast the
                people who commission them.
              </p>
              <p className="mt-10 flex items-center gap-3 text-caption tracking-[0.2em] text-white/65 uppercase">
                <span aria-hidden className="h-px w-10 bg-cyan-400" />
                Lebanon
              </p>
            </div>

            {/* ── The card ──────────────────────────────────────────── */}
            <div
              // `max-w-md` at every size: below `lg` the grid collapses to one
              // column, and without a cap the card stretched edge to edge and
              // stopped reading as an object resting on the wall.
              className="w-full max-w-md justify-self-center lg:max-w-none lg:justify-self-end"
              style={{
                animation:
                  "card-rise var(--duration-slow) var(--ease-material) both",
                animationDelay: "420ms",
              }}
            >
              {/*
                THREE shadows, not one. A single large blur reads as a drop
                shadow; a contact shadow plus a mid lift plus a long ambient
                cast is how a real object sits on a surface. The inset
                highlight is the pane's own lit inner edge.

                Padding steps on the 8px system: 24 / 32 / 40.
              */}
              <div
                className="relative rounded-lg border border-white/18 bg-white/10 p-6 backdrop-blur-2xl sm:p-8 lg:p-10"
                style={{
                  // Tokens throughout — `--color-navy-950` mixed down to each
                  // layer's strength, never a literal. Contact, lift, ambient
                  // cast, then the pane's own lit inner edge.
                  boxShadow: [
                    "0 1px 2px color-mix(in oklab, var(--color-navy-950) 45%, transparent)",
                    "0 8px 24px -8px color-mix(in oklab, var(--color-navy-950) 60%, transparent)",
                    "0 40px 96px -32px color-mix(in oklab, var(--color-navy-950) 92%, transparent)",
                    "inset 0 1px 0 color-mix(in oklab, var(--color-white) 14%, transparent)",
                  ].join(", "),
                  animation: "card-float 9s var(--ease-material) 2.2s infinite",
                }}
              >
                {/* A faint diagonal reflection ON the glass — the giveaway
                    that a pane is a pane and not a translucent fill. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg"
                >
                  <div
                    className="absolute -top-1/2 h-[200%] w-1/2 opacity-40"
                    style={{
                      insetInlineStart: "-10%",
                      transform: "rotate(18deg)",
                      backgroundImage:
                        "linear-gradient(90deg, transparent, color-mix(in oklab, var(--color-white) 7%, transparent), transparent)",
                    }}
                  />
                </div>
                {/* A hairline highlight along the top edge — the lit edge of a
                    real pane of glass. Without it the card reads as a flat
                    translucent rectangle. */}
                <div
                  aria-hidden
                  style={{ insetInline: "1.5rem" }}
                  className="pointer-events-none absolute top-0 h-px bg-linear-to-r from-transparent via-white/40 to-transparent"
                />

                {eyebrow ? (
                  // card, which sits on the darkened navy-950 wall.
                  // eslint-disable-next-line amin/no-cyan-text -- inside the glass card over navy-950; cyan-100 is 11.4:1 there
                  <p className="mb-4 text-caption tracking-[0.22em] text-cyan-100 uppercase">
                    {eyebrow}
                  </p>
                ) : null}

                {/* `display-md`, not `heading-lg`. Marcellus is a display face
                    and only earns its keep above 28px (docs/02 §4.2); at the
                    smaller size it read as body copy in a serif and the card
                    had no focal point at all. */}
                <h1 className="font-display text-display-md leading-[1.02] tracking-[-0.015em] text-white">
                  {title}
                </h1>

                {description ? (
                  <p className="mt-4 text-body-sm leading-relaxed text-white/60">
                    {description}
                  </p>
                ) : null}

                <div className="mt-8">{children}</div>

                {footer ? (
                  <div className="mt-8 border-t border-white/10 pt-6 text-body-sm text-white/75">
                    {footer}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </main>

        {/* ── Foot ──────────────────────────────────────────────────── */}
        <footer
          className="flex flex-wrap items-center justify-between gap-3 text-caption text-white/60"
          style={{
            animation: "fade-in var(--duration-base) var(--ease-material) both",
            animationDelay: "900ms",
          }}
        >
          <span>© {new Date().getFullYear()} Amin Ceramic</span>
          <span className="flex items-center gap-2">
            <LockGlyph />
            Encrypted connection · Staff access only
          </span>
        </footer>
      </div>
    </div>
  );
}

/** Small padlock for the footer's trust line. */
function LockGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-3.5">
      <rect
        x="4.5"
        y="10.5"
        width="15"
        height="10"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M8 10.5V7.5a4 4 0 0 1 8 0v3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
