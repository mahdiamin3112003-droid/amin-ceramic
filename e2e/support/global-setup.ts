/**
 * Warm the routes the suite is about to hammer.
 *
 * ── The problem this solves ──
 * Playwright's `webServer.url` health check only waits for `/` to answer.
 * The first test to touch any OTHER route therefore pays that route's whole
 * cold path: a fresh Prisma pool connection, plus the first round trip to a
 * Supabase project in another region. On a laptop that regularly pushed the
 * first sign-in past the 10s expect timeout and failed
 * `auth-flow.spec.ts`'s opening test — a test that is not broken, on a
 * product that is not broken.
 *
 * ── Why warming rather than a longer timeout ──
 * Raising `expect.timeout` would hide the cold start by making EVERY
 * assertion in all 84 specs slower to fail, including the ones that would
 * be catching a real regression. Paying the cost once, here, keeps every
 * assertion as tight as it was: a page that is genuinely slow still fails.
 *
 * Sequential, never `Promise.all`. These routes each open their own
 * `withRequestContext` transaction, and firing them concurrently against a
 * small pgbouncer pool is the exact P2024/P2028 starvation this project has
 * already been bitten by once.
 */

const ROUTES = [
  "/en",
  "/en/products",
  "/en/search?q=a",
  "/en/basket",
  "/admin/login",
] as const;

const PORT = 3100;
const BASE = `http://localhost:${String(PORT)}`;

/** The server may still be coming up — Playwright's start order is not guaranteed. */
async function waitForServer(deadlineMs: number): Promise<boolean> {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    try {
      const response = await fetch(BASE, { redirect: "manual" });
      if (response.status > 0) return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return false;
}

/**
 * Refuse to start when the fixture cannot reach the database.
 *
 * ── Why this aborts rather than falling back ──
 * Every admin spec creates its staff account through this connection, so if
 * it is down the entire admin suite is meaningless. Left unchecked the
 * outage arrives as `PrismaClientInitializationError` scattered across a
 * dozen unrelated specs, which reads exactly like a dozen broken features —
 * observed twice, at 11 and then 26 red tests, neither of them real.
 *
 * Falling back to the pooled `DATABASE_URL` was tried and was WORSE: that
 * URL carries `connection_limit=1`, so the fixture then fights the
 * application server for a single connection and the run collapses (26
 * failed, 32 never ran). A degraded run that looks like product breakage is
 * worse than no run at all.
 *
 * So: one probe, and either the suite runs meaningfully or it stops with a
 * sentence saying why.
 */
async function assertFixtureDatabaseReachable(): Promise<void> {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) return;

  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    await client.$queryRaw`SELECT 1`;
  } catch {
    const port = /:(\d+)\//.exec(url)?.[1] ?? "?";
    throw new Error(
      `\n\n  The e2e fixture cannot reach the database (port ${port}).\n\n` +
        `  Nothing is wrong with the application. Every admin spec creates its\n` +
        `  staff account over this connection, so the run is stopping here\n` +
        `  rather than reporting dozens of failures that are not real.\n\n` +
        `  Check, in order:\n` +
        `    - network: Postgres ports are often blocked on tethered or\n` +
        `      restricted connections, while HTTPS keeps working\n` +
        `    - the Supabase project is not paused\n` +
        `    - DIRECT_URL and DATABASE_URL in .env.local\n\n` +
        `  The public suite needs no fixture database: pnpm test:e2e:public\n`,
    );
  } finally {
    await client.$disconnect();
  }
}

export default async function globalSetup(): Promise<void> {
  await assertFixtureDatabaseReachable();

  if (!(await waitForServer(60_000))) {
    // Not fatal: the specs themselves will report a genuinely dead server
    // far more legibly than a throw from setup would.
    console.warn("[e2e] warmup skipped — server did not answer in time");
    return;
  }

  const started = Date.now();
  for (const route of ROUTES) {
    try {
      const response = await fetch(`${BASE}${route}`, { redirect: "manual" });
      // Drain the body so the request actually completes server-side.
      await response.text();
    } catch {
      // A route that cannot be warmed is a finding for the spec that covers
      // it, not a reason to abort the run.
    }
  }
  console.log(
    `[e2e] warmed ${String(ROUTES.length)} routes in ${String(Date.now() - started)}ms`,
  );
}
