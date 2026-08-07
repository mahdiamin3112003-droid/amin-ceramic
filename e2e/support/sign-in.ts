import { expect, type Page } from "@playwright/test";

import type { TestStaff } from "./staff-fixture";
import { generateTotp, secondsUntilNextWindow } from "./totp";

/**
 * Signing in, shared by every spec that needs a session.
 *
 * ── The TOTP timing race ──
 * A code is only valid for the 30-second window it was generated in. Fill,
 * click, Server Action, Supabase round trip and re-render together take a
 * second or two — more on a loaded CI box — so a code generated at :28 can
 * easily arrive at :31 and be correctly rejected. That produced a flaky
 * failure indistinguishable from a broken second factor.
 *
 * Two defences, in order:
 *   1. Never start inside the last 8 seconds of a window.
 *   2. If a code is rejected anyway, take the next one and try once more —
 *      which is exactly what the UI tells a person to do.
 *
 * Retrying is safe here because a REJECTED code is asserted separately, in
 * `auth-flow.spec.ts`, with a deliberately wrong code. This helper's job is
 * to get signed in, not to test the failure path.
 */
const SAFE_MARGIN_SECONDS = 8;

async function waitForFreshWindow(page: Page): Promise<void> {
  const remaining = secondsUntilNextWindow();
  if (remaining < SAFE_MARGIN_SECONDS) {
    await page.waitForTimeout((remaining + 1) * 1000);
  }
}

/** Enter the first factor. Does not wait for where it lands. */
export async function submitCredentials(
  page: Page,
  staff: TestStaff,
  options: { rememberMe?: boolean } = {},
): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(staff.email);
  await page.getByLabel("Password", { exact: true }).fill(staff.password);
  if (options.rememberMe) {
    await page.getByText("Keep me signed in").click();
  }
  await page.getByRole("button", { name: "Sign in" }).click();
}

/**
 * Read the enrolment secret from the manual-entry disclosure — the same
 * string a person would type into their authenticator app.
 */
export async function readEnrolmentSecret(page: Page): Promise<string> {
  const disclosure = page.getByText(/can.t scan it/i);
  // The enrolment call runs in an effect after paint, so the disclosure
  // appears a beat after the URL settles.
  await expect(disclosure).toBeVisible({ timeout: 30_000 });
  await disclosure.click();

  const secret = (await page.locator("code").first().innerText()).trim();
  expect(secret.length, "enrolment secret looks wrong").toBeGreaterThan(15);
  return secret;
}

/** Submit a TOTP code, retrying once with a fresh one if the window rolled. */
export async function submitTotp(
  page: Page,
  secret: string,
  buttonName: RegExp,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await waitForFreshWindow(page);
    await page.getByLabel(/six-digit code/i).fill(generateTotp(secret));
    await page.getByRole("button", { name: buttonName }).click();

    // Either we navigated off /admin/2fa, or an alert came back.
    const rejected = page.getByRole("main").getByRole("alert");
    const settled = await Promise.race([
      page
        .waitForURL((url) => !url.pathname.includes("/admin/2fa"), {
          timeout: 15_000,
        })
        .then(() => "ok" as const),
      rejected
        .waitFor({ state: "visible", timeout: 15_000 })
        .then(() => "rejected" as const),
    ]).catch(() => "timeout" as const);

    if (settled === "ok") return;
    if (settled === "timeout") break;
    // Rejected: fall through and try the next window's code once.
  }

  // Let the caller's own assertion produce the failure message.
  await expect(page).not.toHaveURL(/\/admin\/2fa/);
}

/**
 * TOTP secrets, keyed by Supabase auth user id.
 *
 * ── Why this has to exist ──
 * Signing in MUTATES the account when the role requires MFA: the first
 * sign-in enrols a factor, and every sign-in after that is a verification
 * against the factor already there. The two screens are different — the
 * enrolment one carries the manual-entry disclosure and a "Confirm and
 * continue" button, the verification one has neither.
 *
 * That is what broke when account creation moved to `beforeAll`: the first
 * test in a block enrolled, and every test after it landed on the
 * verification screen while this helper was still looking for the enrolment
 * secret. Thirteen specs failed at once, all of them `editor`, `sales` or
 * `owner` — the roles that require MFA. The `viewer` blocks passed
 * throughout, which is precisely the tell.
 *
 * Holding the secret means an account can be signed into repeatedly, which
 * is what makes reuse work at all.
 */
const enrolledSecrets = new Map<string, string>();

/**
 * Sign in completely, enrolling a second factor or verifying the existing
 * one, whichever this account needs.
 *
 * Read-only roles never see the second factor at all — that is the
 * read-only allowlist working, asserted implicitly on every call.
 */
export async function signInFully(page: Page, staff: TestStaff): Promise<void> {
  await submitCredentials(page, staff);

  await page.waitForURL(/\/admin(\/2fa)?(\?.*)?$/);
  if (!page.url().includes("/admin/2fa")) return;

  const known = enrolledSecrets.get(staff.authUserId);
  if (known) {
    // Already enrolled by an earlier test in this block: verify instead.
    await submitTotp(page, known, /^verify$/i);
  } else {
    const secret = await readEnrolmentSecret(page);
    enrolledSecrets.set(staff.authUserId, secret);
    await submitTotp(page, secret, /confirm and continue/i);
  }

  // `submitTotp` has already waited for the navigation off /admin/2fa, so
  // this only confirms where it landed. An extra `waitForURL("/admin")`
  // here waits for a `load` event that has already fired and can hang for
  // the whole test timeout — a flake that surfaced only under the full
  // suite, where it looked like a broken second factor.
  await expect(page).toHaveURL(/\/admin(\/|$|\?)/);
}
