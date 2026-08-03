"use client";

import type { ReactNode } from "react";

import { motion, useReducedMotion } from "framer-motion";

/**
 * docs/02-ux-blueprint.md §5.4: `whileInView`, `once: true`, 15% viewport
 * entry, rise + fade. `prefers-reduced-motion` collapses this to a plain
 * opacity fade — no rise — via `useReducedMotion()`.
 */
export function ScrollReveal({
  children,
  delay = 0,
  riseBy = 24,
  className,
}: {
  children: ReactNode;
  delay?: number;
  riseBy?: number;
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : riseBy }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{
        duration: prefersReducedMotion ? 0.2 : 0.6,
        delay,
        ease: [0.25, 1, 0.5, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
