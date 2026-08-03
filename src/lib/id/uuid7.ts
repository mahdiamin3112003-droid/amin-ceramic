/**
 * UUIDv7 generation — Edge- and Node-safe (uses only the global Web Crypto
 * API, no npm dependency).
 *
 * Mirrors the database's own `uuid_generate_v7()` (prisma/migrations
 * §identity), which every primary key in this schema defaults to: a 48-bit
 * millisecond timestamp prefix keeps ids roughly sortable and index-friendly,
 * unlike UUIDv4. The visitor cookie (docs/04-api-architecture.md §4.2) mints
 * its id client-request-side, in middleware, before any database row exists
 * for it — so it needs its own generator rather than relying on the DB
 * default.
 */
export function generateUuidV7(): string {
  const unixTsMs = BigInt(Date.now());
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  bytes[0] = Number((unixTsMs >> 40n) & 0xffn);
  bytes[1] = Number((unixTsMs >> 32n) & 0xffn);
  bytes[2] = Number((unixTsMs >> 24n) & 0xffn);
  bytes[3] = Number((unixTsMs >> 16n) & 0xffn);
  bytes[4] = Number((unixTsMs >> 8n) & 0xffn);
  bytes[5] = Number(unixTsMs & 0xffn);

  // Version 7 in the high nibble of byte 6.
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f);
  // Variant (10xx) in the top two bits of byte 8.
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
