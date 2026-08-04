import { createHmac } from "node:crypto";

/**
 * TOTP (RFC 6238) — the authenticator app, in about forty lines.
 *
 * This is what makes the second factor testable. Supabase hands back a
 * base32 secret at enrolment; an authenticator app turns that plus the
 * current time into a six-digit code, and so does this. Without it, every
 * MFA path in the product would be permanently unverifiable by machine and
 * would have to be re-checked by hand forever.
 *
 * It exists ONLY under `e2e/`. Nothing in `src/` imports it, and it is not
 * a second implementation of anything the app does — the app never
 * generates codes, it only asks Supabase to verify them.
 */

/** RFC 4648 base32, no padding — the alphabet Supabase's secret uses. */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Buffer {
  // Authenticator secrets are often shown space-separated and lowercase.
  const clean = input.replace(/[\s=]/g, "").toUpperCase();

  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`invalid base32 character: ${char}`);

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(out);
}

/**
 * The current six-digit code for `secret`.
 *
 * `step` is the 30-second window. `offset` shifts by whole windows, which
 * is what lets a test ask for the PREVIOUS code — the one case worth
 * testing deliberately, since Supabase accepts a small window of drift and
 * a test that reused the same code twice would pass for the wrong reason.
 */
export function generateTotp(
  secret: string,
  offset = 0,
  step = 30,
  digits = 6,
): string {
  const counter = Math.floor(Date.now() / 1000 / step) + offset;

  const buffer = Buffer.alloc(8);
  // Big-endian 64-bit counter. The high word is always zero this century,
  // so only the low 32 bits are meaningful.
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);

  const hmac = createHmac("sha1", base32Decode(secret)).update(buffer).digest();

  // Dynamic truncation (RFC 4226 §5.3): the low nibble of the last byte
  // picks where in the digest to read the code from, and the code is the
  // last 31 bits of the four bytes starting there.
  //
  // `readUInt32BE` + a mask rather than four indexed reads shifted
  // together: it says what it means, and it needs no non-null assertions
  // to satisfy `noUncheckedIndexedAccess`.
  const last = hmac.at(-1);
  if (last === undefined) throw new Error("empty HMAC digest");

  const start = last & 0x0f;
  const binary = hmac.readUInt32BE(start) & 0x7fffffff;

  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

/**
 * Seconds until the current window closes.
 *
 * A test that enrols at second 29 and verifies at second 31 gets a code
 * that has already rolled over, which looks exactly like a broken TOTP
 * implementation. Callers wait past the boundary when it is close.
 */
export function secondsUntilNextWindow(step = 30): number {
  return step - (Math.floor(Date.now() / 1000) % step);
}
