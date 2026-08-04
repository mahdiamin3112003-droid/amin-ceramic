import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import {
  hardenAuthCookie,
  toSessionScoped,
} from "@/infrastructure/auth/cookie-policy";

/**
 * Supabase Auth — the server-side client.
 *
 * docs/01-architecture.md §5.1: "Supabase Auth (admin only, v1). Email+
 * password with mandatory TOTP for admin roles."
 *
 * SESSION STORAGE IS COOKIES, NEVER `localStorage` — docs/04 §4.6 is
 * explicit: "Tokens in JS-readable storage are one XSS away from full
 * account compromise, and no CSP is perfect."
 *
 * Cookies alone are NOT enough to satisfy that, and an earlier version of
 * this comment wrongly claimed `createServerClient` handled it.
 * `@supabase/ssr` sets neither `httpOnly` nor `secure`, so the token was
 * script-readable and plaintext-transmissible until `hardenAuthCookie`
 * started wrapping every write below. See `cookie-policy.ts`.
 *
 * This is the AUTH client only. It never queries application tables —
 * every one of those goes through Prisma under `withRequestContext` so RLS
 * sees the claims. Mixing the two would create a second, unaudited path to
 * the data.
 */
export async function createSupabaseServerClient(options?: {
  /**
   * When false, auth cookies are written WITHOUT `maxAge`/`expires`, making
   * them session cookies that the browser discards on close. That is what
   * "keep me signed in" has always meant, and implementing it here — at the
   * only place cookies are written — is what keeps the checkbox on the
   * login form from being decoration.
   *
   * Undefined leaves Supabase's own lifetimes untouched, which is correct
   * for every caller that is not the sign-in action (a page render must not
   * silently downgrade an existing persistent session).
   */
  readonly persistSession?: boolean;
}) {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for admin auth",
    );
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options: cookieOptions } of cookiesToSet) {
            // EVERY write is hardened; the persistSession branch only
            // decides whether a lifetime survives.
            cookieStore.set(
              name,
              value,
              options?.persistSession === false
                ? toSessionScoped(cookieOptions)
                : hardenAuthCookie(cookieOptions),
            );
          }
        } catch {
          // `cookies()` is read-only inside Server Components. Writes happen
          // in Server Actions and Route Handlers, and the middleware
          // refreshes the session on every request, so swallowing here is
          // correct rather than lossy — it is the documented @supabase/ssr
          // pattern, not a silenced bug.
        }
      },
    },
  });
}
