import type { ReactNode } from "react";

/**
 * Next requires a root layout, but `<html>` and `<body>` are rendered one level
 * down in `[locale]/layout.tsx` — that is the only place `lang` and `dir` are
 * known. This layout is a pass-through by design.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
