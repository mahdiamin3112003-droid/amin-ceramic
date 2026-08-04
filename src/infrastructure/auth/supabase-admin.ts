import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. BYPASSES RLS.
 *
 * Used for exactly one thing in Phase 4: writing objects into Storage,
 * which has no per-request user session to authorise against the way a
 * table query does. Every caller must have already passed
 * `requirePermission` before reaching this — the client itself checks
 * nothing.
 *
 * `SUPABASE_SERVICE_ROLE_KEY` must never reach the browser (docs/01 §8.3;
 * CI fails the build if the string appears in a client chunk). The
 * `server-only` import is what makes an accidental client import a BUILD
 * error rather than a leaked key discovered later.
 */
import "server-only";

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for media uploads",
    );
  }

  cached = createClient(url, serviceKey, {
    // No session to persist and nothing to refresh — this client is never
    // acting on behalf of a user.
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}
