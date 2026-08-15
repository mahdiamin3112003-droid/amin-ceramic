import { createHmac } from "node:crypto";

import type { RequestTransaction } from "@/infrastructure/db/request-context";

/**
 * Rate limiting for public AI endpoints — docs/01-architecture.md §6.6,
 * ADR-0020.
 *
 * The Tile Finder is the first public endpoint in this application that
 * spends real money per request (Replicate + OpenAI + Gemini). An
 * unthrottled loop against it bills all three until a budget ceiling trips,
 * so this is a cost control before it is an abuse control.
 */

export interface RateLimitRule {
  /** Requests permitted per window. */
  readonly limit: number;
  readonly windowSeconds: number;
}

/**
 * Two rules per request, both enforced.
 *
 * The visitor cookie is the useful key — it survives NAT, where many real
 * customers share one address, so limiting on IP alone would throttle an
 * office or a phone network as though it were one person. But a cookie is
 * trivially discarded, so IP is the backstop that actually bounds spend,
 * set high enough not to catch a shared connection in ordinary use.
 */
export const TILE_FINDER_PER_VISITOR: RateLimitRule = {
  limit: 10,
  windowSeconds: 60 * 60,
};

export const TILE_FINDER_PER_IP: RateLimitRule = {
  limit: 40,
  windowSeconds: 60 * 60,
};

export interface RateLimitOutcome {
  readonly allowed: boolean;
  /** Requests remaining in the window; 0 once blocked. */
  readonly remaining: number;
  /** When the current window ends — drives the Retry-After header. */
  readonly resetAt: Date;
}

/**
 * Hash the identity before it is stored.
 *
 * An IP address is personal data, and this table exists to count requests,
 * not to record who made them. HMAC (not a bare hash) so the values cannot
 * be recovered by hashing the whole IPv4 space — which a plain SHA-256 of an
 * IP absolutely permits.
 *
 * Reuses `VISITOR_COOKIE_SECRET`: it is already required, already rotated
 * with the others, and already guards visitor identity specifically.
 */
export function bucketFor(scope: string, identity: string): string {
  const secret = process.env.VISITOR_COOKIE_SECRET;
  if (!secret) {
    throw new Error(
      "VISITOR_COOKIE_SECRET is required to derive a rate-limit bucket",
    );
  }
  const digest = createHmac("sha256", secret).update(identity).digest("base64url");
  return `${scope}:${digest.slice(0, 32)}`;
}

function windowStartFor(rule: RateLimitRule, now: Date): Date {
  const ms = rule.windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

/**
 * Consume one unit and report whether the caller may proceed.
 *
 * The increment happens inside `app.consume_rate_limit`, an atomic UPSERT —
 * two concurrent requests cannot both read a stale count and each conclude
 * they are under the limit.
 *
 * FAILS CLOSED on a database error, unlike most of this codebase's
 * fail-open-as-anonymous defaults. Those degrade a visitor to seeing less;
 * this one degrades to unmetered spending on three paid APIs, so an
 * unavailable limiter must stop the request rather than wave it through.
 */
export async function consumeRateLimit(
  tx: RequestTransaction,
  tenantId: string,
  bucket: string,
  rule: RateLimitRule,
  now: Date = new Date(),
): Promise<RateLimitOutcome> {
  const windowStart = windowStartFor(rule, now);
  const resetAt = new Date(windowStart.getTime() + rule.windowSeconds * 1000);

  const rows = await tx.$queryRaw<{ count: number }[]>`
    SELECT app.consume_rate_limit(
      ${tenantId}::uuid, ${bucket}, ${windowStart}::timestamptz
    ) AS count
  `;

  const count = rows[0]?.count;
  if (count === undefined) {
    throw new Error("rate limiter returned no count");
  }

  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    resetAt,
  };
}

/** The first rule to reject wins, so the tightest limit is reported. */
export async function consumeAll(
  tx: RequestTransaction,
  tenantId: string,
  checks: readonly { bucket: string; rule: RateLimitRule }[],
  now: Date = new Date(),
): Promise<RateLimitOutcome> {
  let tightest: RateLimitOutcome | null = null;

  for (const check of checks) {
    const outcome = await consumeRateLimit(
      tx,
      tenantId,
      check.bucket,
      check.rule,
      now,
    );
    if (!outcome.allowed) return outcome;
    if (tightest === null || outcome.remaining < tightest.remaining) {
      tightest = outcome;
    }
  }

  if (tightest === null) {
    throw new Error("consumeAll requires at least one rule");
  }
  return tightest;
}
