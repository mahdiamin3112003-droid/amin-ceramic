/**
 * Server Action result envelope.
 *
 * Next.js swallows a thrown Server Action error's message in production, so
 * every action here catches and returns this shape instead. Same
 * degrade-don't-fail convention as the read use-cases (§18.3, see
 * get-active-tenant.ts): `error` is for logging/diagnostics, not verbatim
 * display — the calling page/form maps it to a designed, translated
 * message rather than rendering it directly, since it may carry
 * lower-level detail (e.g. a Postgres constraint message).
 */
export type ActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T>(error: unknown, fallback: string): ActionResult<T> {
  const message = error instanceof Error ? error.message : fallback;
  console.error(`[action] ${fallback}`, error);
  return { ok: false, error: message };
}
