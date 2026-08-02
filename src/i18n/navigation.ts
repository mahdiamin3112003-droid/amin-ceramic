import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * Locale-aware navigation primitives. Use these everywhere instead of the ones
 * from `next/link` and `next/navigation` — they carry the locale prefix, so a
 * link written as `/products` resolves to `/en/products` or `/ar/products`
 * without any component knowing which locale it is rendering in.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
