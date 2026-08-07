import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    // Absent is fine — CI supplies the variables directly.
  }
}

const PORT = 3100;
const baseURL = `http://localhost:${String(PORT)}`;

/**
 * End-to-end configuration.
 *
 * ── Why a production build, not `pnpm dev` ──
 * The dev server recompiles routes on first hit, which turns the first
 * assertion of every spec into a timing lottery and hides real slowness
 * behind fake slowness. `pnpm build && pnpm start` is also what the
 * middleware auth gate actually ships as.
 *
 * ── Why one worker ──
 * Every spec creates and deletes staff accounts against ONE shared Supabase
 * project. Parallel workers would race each other's teardown and the
 * failures would look like auth bugs. Correctness beats wall-clock here;
 * the suite is small.
 */
export default defineConfig({
  testDir: "./e2e",
  // `*.spec.ts` only. Playwright's default also matches `*.test.ts`, which
  // would sweep up `e2e/support/totp.test.ts` — a vitest file whose import
  // of `vitest` crashes outside the vitest runner. The two suites share the
  // directory; they do not share a runner.
  testMatch: "**/*.spec.ts",
  // The TOTP specs deliberately wait out a 30-second window boundary, and a
  // sign-in on a cold route has been measured near a minute under load.
  timeout: 120_000,

  /**
   * 30s, not Playwright's 10s default.
   *
   * Every public page is `force-dynamic` and every interaction is a Server
   * Action or a soft navigation that re-renders from the database — and the
   * database is a Supabase project in another region, reached from a laptop.
   * The `globalSetup` warmup measured five cold routes at 26 SECONDS total.
   *
   * This is not a loosened assertion. Across four full runs, every single
   * failure attributable to this number was a timeout on an expectation that
   * was CORRECT and simply had not resolved yet — never a wrong value. A
   * timeout that only fires on correct behaviour protects nothing and costs
   * a false failure each run. Raising it does not slow passing tests: an
   * expectation resolves the moment it is true.
   *
   * If these pages are still this slow once deployed next to their database,
   * that is a performance finding to chase — not a reason to lower this back.
   */
  expect: { timeout: 30_000 },

  fullyParallel: false,
  workers: 1,

  // A failing auth test is never acceptable, so a green run must never be a
  // retry away from red. Retries only in CI, and only for flake in the
  // harness rather than in the product.
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),

  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],

  globalSetup: "./e2e/support/global-setup.ts",
  globalTeardown: "./e2e/support/global-teardown.ts",

  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  // Reduced motion is applied by the shared `test` fixture in
  // e2e/support/test.ts rather than here — `@playwright/test`'s UseOptions
  // does not carry `reducedMotion` in this version.
  /**
   * Two projects so the halves can run as separate invocations —
   * `pnpm test:e2e:public` / `pnpm test:e2e:admin`.
   *
   * Only the admin half creates Supabase Auth accounts, and sustained
   * account churn is what makes Supabase start answering sign-ins for
   * just-created users with `403 user_not_found`. Splitting keeps each run
   * roughly half as long, so neither sits as deep in that window. The real
   * reduction came from reusing one account per describe block; this is the
   * cheap structural half of the same fix, and it also means a public-side
   * change can be verified in ~7 minutes instead of ~22.
   *
   * `pnpm test:e2e` with no argument still runs both.
   */
  projects: [
    {
      name: "public",
      testMatch: /public-.*\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "admin",
      testIgnore: /public-.*\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "pnpm build && pnpm start --port 3100",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    // A cold production build is slow the first time.
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
