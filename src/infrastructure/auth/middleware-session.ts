import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { hardenAuthCookie } from "@/infrastructure/auth/cookie-policy";

/**
 * Supabase session handling for EDGE middleware.
 *
 * Separate from `supabase-server.ts` because the cookie APIs differ: a
 * Server Component reads `cookies()` from `next/headers`, whereas
 * middleware must read from the request and write onto the response it
 * returns. Sharing one helper across both would mean branching on runtime
 * inside it, which is how the refresh silently stops working.
 *
 * Refreshing here on every admin request is what keeps rotating refresh
 * tokens alive (docs/04 §4.6). Without it the session expires mid-visit
 * even while the user is active.
 */
export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse;
  user: { id: string; email?: string } | null;
}> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // Fail CLOSED here, unlike the visitor cookie: without auth configured
    // there is no way to establish a staff session, so admin must not be
    // reachable. Returning no user makes the caller redirect to login.
    console.error("[middleware] Supabase env missing — admin routes unavailable");
    return { response, user: null };
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          // The refresh path writes cookies too, so it needs the same
          // hardening — a token rotated here must not come back readable.
          response.cookies.set(name, value, hardenAuthCookie(options));
        }
      },
    },
  });

  // `getUser()`, not `getSession()`: the latter returns the cookie's
  // contents without verifying them, which is worthless as a gate.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    response,
    user: user ? { id: user.id, email: user.email } : null,
  };
}
