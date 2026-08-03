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
 */
export default function LocaleTemplate({ children }: { children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, clipPath: "polygon(0 0, 0 0, -35% 100%, 0 100%)" }}
      animate={{ opacity: 1, clipPath: "polygon(0 0, 135% 0, 100% 100%, 0 100%)" }}
      transition={{ duration: 0.38, ease: [0.76, 0, 0.24, 1] }}
    >
      {children}
    </motion.div>
  );
}
