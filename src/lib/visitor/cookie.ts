import { generateUuidV7 } from "@/lib/id/uuid7";

/**
 * The visitor cookie — docs/04-api-architecture.md §4.2.
 *
 * "Mint a UUIDv7, set it httpOnly + secure + sameSite=lax with a 1-year
 * expiry, and sign it with an HMAC so a client cannot forge another
 * visitor's ID." The signed value is what the cookie actually stores; the
 * bare UUID is what becomes `visitor.id` (and the `visitor_id` RLS claim) —
 * its own INSERT policy requires `id = app.visitor_id()`, so a forged id
 * could otherwise let a client claim someone else's saved items or open
 * quotes.
 *
 * Runs in both the Edge middleware and Node Server Components/Actions, so it
 * uses only the global Web Crypto API (`crypto.subtle`), not a Node-only
 * `crypto` import.
 */

export const VISITOR_COOKIE_NAME = "ac_vid";
export const VISITOR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Mint a fresh visitor id and its signed cookie value. */
export async function mintVisitorCookie(
  secret: string,
): Promise<{ visitorId: string; cookieValue: string }> {
  const visitorId = generateUuidV7();
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(visitorId),
  );
  return { visitorId, cookieValue: `${visitorId}.${toBase64Url(signature)}` };
}

/**
 * Verify a cookie value and return the visitor id, or null if the value is
 * missing, malformed, or its signature doesn't match — any of which is
 * treated as "no visitor yet" rather than an error, since a tampered or
 * stale cookie should fail open into a fresh visitor, not break the request.
 */
export async function verifyVisitorCookie(
  cookieValue: string | undefined,
  secret: string,
): Promise<string | null> {
  if (!cookieValue) return null;
  const dotIndex = cookieValue.lastIndexOf(".");
  if (dotIndex <= 0) return null;

  const visitorId = cookieValue.slice(0, dotIndex);
  const signatureBase64Url = cookieValue.slice(dotIndex + 1);

  const key = await hmacKey(secret);
  const expectedSignature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(visitorId),
  );

  return toBase64Url(expectedSignature) === signatureBase64Url ? visitorId : null;
}
