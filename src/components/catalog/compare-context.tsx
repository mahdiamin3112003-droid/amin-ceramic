"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Compare-tray selection — docs/02-ux-blueprint.md §3.2/§3.6: a persistent
 * bottom bar that survives navigation between the listing, search and PDP
 * while browsing.
 *
 * This is a pure UI selection, not account/visitor data — unlike the
 * wishlist and basket (both DB-backed, tied to the `ac_vid` cookie), there
 * is no server concept of "products currently being compared". `sessionStorage`
 * is the precedent already established in this codebase for exactly this
 * shape of state (docs/01-architecture.md §"intro plays once per session"),
 * so it's reused here rather than introducing a new persistence mechanism —
 * CLAUDE.md's "no browser storage beyond what the docs specify" is about
 * not inventing ad hoc client caches for server data, not about ruling out
 * the one client-only UI-state pattern the docs already use.
 */

const STORAGE_KEY = "ac_compare_ids";
const MAX_COMPARE = 4;

interface CompareContextValue {
  readonly ids: readonly string[];
  readonly isSelected: (id: string) => boolean;
  readonly toggle: (id: string) => void;
  readonly clear: () => void;
  readonly isFull: boolean;
}

const CompareContext = createContext<CompareContextValue | null>(null);

function readStoredIds(): readonly string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

export function CompareProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<readonly string[]>([]);

  // Reads sessionStorage only after mount — this stays in sync with SSR's
  // empty initial state and avoids a hydration mismatch.
  useEffect(() => {
    setIds(readStoredIds());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  }, [ids]);

  const toggle = useCallback((id: string) => {
    setIds((current) => {
      if (current.includes(id)) return current.filter((v) => v !== id);
      if (current.length >= MAX_COMPARE) return current;
      return [...current, id];
    });
  }, []);

  const clear = useCallback(() => {
    setIds([]);
  }, []);

  const value = useMemo<CompareContextValue>(
    () => ({
      ids,
      isSelected: (id) => ids.includes(id),
      toggle,
      clear,
      isFull: ids.length >= MAX_COMPARE,
    }),
    [ids, toggle, clear],
  );

  return (
    <CompareContext.Provider value={value}>{children}</CompareContext.Provider>
  );
}

export function useCompare(): CompareContextValue {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error("useCompare must be used within a CompareProvider");
  return ctx;
}
