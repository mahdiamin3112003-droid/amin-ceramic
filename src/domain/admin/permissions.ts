/**
 * Who is obliged to complete TOTP — docs/04 §4.3, IMPLEMENTED AS AN INVERSION.
 *
 * Lives in `domain/` because it is a pure policy decision over a list of
 * strings: no database, no Supabase, no request. It was briefly in
 * `infrastructure/auth/` next to the session resolver, which made it
 * untestable without a live `RUNTIME_DATABASE_URL` — a good sign it was in
 * the wrong layer.
 *
 * §4.3 says: "any role carrying a `.write`, `.manage`, `.approve` or
 * `.adjust` permission". Taken literally that under-covers the actual
 * vocabulary in docs/03 §2.4, and not by a little — `product.create`,
 * `product.update`, `product.publish`, `product.delete`, `user.invite`,
 * `request.respond` and `ai.configure` are every one of them mutations, and
 * every one of them matches none of the four suffixes. A user whose role
 * held only those would delete products without ever being asked for a
 * second factor.
 *
 * So the test is inverted: enumerate the READ-ONLY permissions and require
 * MFA for anything else. The two rules agree on every key the suffix list
 * actually covers; they differ only where it silently missed one.
 *
 * The direction matters more than the contents. A permission added in a
 * later phase and forgotten here defaults to REQUIRING MFA — mildly
 * annoying, and noticed immediately. Under the suffix rule the same
 * oversight defaults to not requiring it, and nothing surfaces.
 *
 * Kept in sync with `PERMISSIONS` in `prisma/seed.ts`.
 */
export const READ_ONLY_PERMISSIONS: ReadonlySet<string> = new Set([
  "product.read",
  "inventory.read",
  "price.trade.read",
  "request.read",
  "ai.costs.read",
  "analytics.read",
  "audit.read",
]);

export function requiresMfa(permissions: readonly string[]): boolean {
  return permissions.some((p) => !READ_ONLY_PERMISSIONS.has(p));
}
