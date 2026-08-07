"use client";

import type { ReactNode } from "react";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Page transitions — docs/02-ux-blueprint.md §5.10 / docs/01 §4.4: "the
 * diamond geometry — a 45° clip-path wipe in navy, 320ms out / 380ms in."
 *
 * A `template.tsx` (not `layout.tsx`) is what makes this possible: Next
 * remounts a template on every navigation, so the enter animation re-runs
 * per route, where a layout would persist and never re-animate.
 *
 * The exit half of the spec's out/in pair isn't expressible here — App
 * Router unmounts the outgoing template before the incoming one mounts,
 * with no shared presence boundary between them, so only the enter wipe
 * runs. Flagged rather than faked: a full out+in would need an
 * intercepting-route or view-transition approach, which is a bigger change
 * than this phase's line item.
 *
 * `prefers-reduced-motion` drops the geometry entirely and leaves a plain
 * opacity fade (docs/02 §5.12).
 *
 * ── Why one motion.div and not two branches ──
 * This used to return a different element per branch: a clip-path wipe, or
 * a bare opacity fade with no `clipPath` in it at all. That shipped the
 * whole public site broken for anyone with "reduce motion" enabled.
 *
 * `useReducedMotion()` cannot know the preference on the server, so SSR
 * always emitted the geometry branch — including
 * `style="clip-path:polygon(0 0, 0 0, -35% 100%, 0 100%)"`, which clips the
 * page to zero width. On the client the preference resolved to true, React
 * swapped in the fade branch, and that branch never mentions `clipPath` —
 * so nothing ever cleared the inline style the server had already written.
 * Opacity animated to 1 over a page clipped to nothing: invisible, and
 * every click fell through to the layout wrapper behind it.
 *
 * The invariant that prevents a recurrence: **every property the server may
 * write inline must also appear in the client's `animate` target.** Both
 * paths below therefore animate `clipPath` to CLIP_OPEN; only the starting
 * value and the duration differ.
 */

/** Closed on the leading edge — the wipe's start. Never an end state. */
const CLIP_CLOSED = "polygon(0 0, 0 0, -35% 100%, 0 100%)";
/** Fully open. Both motion paths must land here. */
const CLIP_OPEN = "polygon(0 0, 135% 0, 100% 100%, 0 100%)";

export default function LocaleTemplate({ children }: { children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={{
        opacity: 0,
        clipPath: prefersReducedMotion ? CLIP_OPEN : CLIP_CLOSED,
      }}
      animate={{ opacity: 1, clipPath: CLIP_OPEN }}
      transition={
        prefersReducedMotion
          ? { duration: 0.2 }
          : { duration: 0.38, ease: [0.76, 0, 0.24, 1] }
      }
    >
      {children}
    </motion.div>
  );
}
