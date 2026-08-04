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
  // The TOTP specs deliberately wait out a 30-second window boundary.
  timeout: 90_000,
  expect: { timeout: 10_000 },

  fullyParallel: false,
  workers: 1,

  // A failing auth test is never acceptable, so a green run must never be a
  // retry away from red. Retries only in CI, and only for flake in the
  // harness rather than in the product.
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),

  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],

  globalTeardown: "./e2e/support/global-teardown.ts",

  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

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
