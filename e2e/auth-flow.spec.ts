import { expect, test, type Page } from "@playwright/test";

import {
  createTestStaff,
  deleteTestStaff,
  listFactors,
  type TestStaff,
} from "./support/staff-fixture";
import { generateTotp, secondsUntilNextWindow } from "./support/totp";

/**
 * The authentication flow, end to end, against a real browser and the real
 * Supabase project.
 *
 * `viewer` is the role used wherever MFA would otherwise get in the way: it
 * holds only read permissions, so `requiresMfa` returns false and sign-in
 * completes in one step. That is not a convenience — it is the assertion
 * that the read-only allowlist works, made every time these run.
 */

/** Sign in through the actual form, the way a person does. */
async function signIn(
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

test.describe("sign in", () => {
  let staff: TestStaff;

  test.beforeEach(async () => {
    staff = await createTestStaff("viewer");
  });
  test.afterEach(async () => {
    await deleteTestStaff(staff);
  });

  test("a read-only role signs in and lands on the dashboard", async ({ page }) => {
    await signIn(page, staff);

    await expect(page).toHaveURL("/admin");
    await expect(
      page.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible();
  });

  test("returns the user to where they were headed", async ({ page }) => {
    // Bounced off a deep link, then sent back to it after signing in.
    await page.goto("/admin/inventory");
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Finventory/);

    await page.getByLabel("Email").fill(staff.email);
    await page.getByLabel("Password", { exact: true }).fill(staff.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/admin/inventory");
  });

  test("a wrong password gives nothing away", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(staff.email);
    await page
      .getByLabel("Password", { exact: true })
      .fill("not-the-right-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    const alert = page.getByRole("main").getByRole("alert");
    await expect(alert).toBeVisible();
    // The SAME message a nonexistent address gets — see below.
    await expect(alert).toContainText("Those details didn't work");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("an unknown address is indistinguishable from a wrong password", async ({
    page,
  }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill("no-such-user@e2e.invalid");
    await page.getByLabel("Password", { exact: true }).fill("whatever");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Byte-identical to the wrong-password case. If these two ever diverge,
    // the login form becomes an account-enumeration endpoint.
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Those details didn't work",
    );
  });

  test("a signed-in user is bounced off the login page", async ({ page }) => {
    await signIn(page, staff);
    await expect(page).toHaveURL("/admin");

    await page.goto("/admin/login");
    await expect(page).toHaveURL("/admin");
  });
});

test.describe("sign out", () => {
  let staff: TestStaff;

  test.beforeEach(async () => {
    staff = await createTestStaff("viewer");
  });
  test.afterEach(async () => {
    await deleteTestStaff(staff);
  });

  test("ends the session and re-protects every route", async ({ page }) => {
    await signIn(page, staff);
    await expect(page).toHaveURL("/admin");

    await page.getByRole("button", { name: /account menu/i }).click();
    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/admin\/login/);

    // The real assertion: the session is gone server-side, not just
    // navigated away from. Going back must not restore access.
    await page.goto("/admin/inventory");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test.describe("session persistence", () => {
  let staff: TestStaff;

  test.beforeEach(async () => {
    staff = await createTestStaff("viewer");
  });
  test.afterEach(async () => {
    await deleteTestStaff(staff);
  });

  test("survives a reload and a fresh tab in the same context", async ({
    page,
    context,
  }) => {
    await signIn(page, staff, { rememberMe: true });
    await expect(page).toHaveURL("/admin");

    await page.reload();
    await expect(page).toHaveURL("/admin");

    const second = await context.newPage();
    await second.goto("/admin");
    await expect(second).toHaveURL("/admin");
    await second.close();
  });

  test('"keep me signed in" is what decides whether cookies outlive the browser', async ({
    page,
    context,
  }) => {
    await signIn(page, staff, { rememberMe: true });
    await expect(page).toHaveURL("/admin");

    const persistent = (await context.cookies()).filter(
      (c) => c.name.startsWith("sb-") && c.expires > 0,
    );
    expect(persistent.length, "ticked → cookies carry an expiry").toBeGreaterThan(
      0,
    );

    // Same account, same browser, box unticked.
    await context.clearCookies();
    await signIn(page, staff, { rememberMe: false });
    await expect(page).toHaveURL("/admin");

    const sessionScoped = (await context.cookies()).filter((c) =>
      c.name.startsWith("sb-"),
    );
    expect(sessionScoped.length, "a session still exists").toBeGreaterThan(0);
    expect(
      sessionScoped.every((c) => c.expires === -1),
      "unticked → every auth cookie is session-scoped and dies with the browser",
    ).toBe(true);
  });

  test("auth cookies are httpOnly and not readable from JavaScript", async ({
    page,
    context,
  }) => {
    await signIn(page, staff, { rememberMe: true });
    await expect(page).toHaveURL("/admin");

    const authCookies = (await context.cookies()).filter((c) =>
      c.name.startsWith("sb-"),
    );
    expect(authCookies.length).toBeGreaterThan(0);
    expect(
      authCookies.every((c) => c.httpOnly),
      "docs/04 §4.6: tokens in JS-readable storage are one XSS from account compromise",
    ).toBe(true);

    const visible = await page.evaluate(() => document.cookie);
    expect(visible).not.toContain("sb-");
  });
});

test.describe("two-factor authentication", () => {
  let staff: TestStaff;

  test.beforeEach(async () => {
    // `editor` holds media.manage and content.manage, so MFA is mandatory.
    staff = await createTestStaff("editor");
  });
  test.afterEach(async () => {
    await deleteTestStaff(staff);
  });

  test("a mutating role is forced through enrolment before it can do anything", async ({
    page,
  }) => {
    await signIn(page, staff);

    // The first factor alone must not reach the dashboard.
    await expect(page).toHaveURL(/\/admin\/2fa/);
    await expect(
      page.getByRole("heading", { name: /set up two-factor/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: /authenticator setup qr/i }),
    ).toBeVisible();

    // Typing the URL does not get past it either.
    await page.goto("/admin/products");
    await expect(page).toHaveURL(/\/admin\/2fa/);
  });

  test("enrolling with a real code completes the session", async ({ page }) => {
    await signIn(page, staff);
    await expect(page).toHaveURL(/\/admin\/2fa/);

    // The secret the QR encodes, read from the manual-entry disclosure —
    // exactly what a person types into their authenticator.
    await page.getByText(/can.t scan it/i).click();
    const secret = (await page.locator("code").first().innerText()).trim();
    expect(secret.length).toBeGreaterThan(15);

    // Don't straddle a window boundary: a code generated at :29 and
    // submitted at :31 has already rolled over.
    if (secondsUntilNextWindow() < 5) {
      await page.waitForTimeout(6000);
    }

    await page.getByLabel(/six-digit code/i).fill(generateTotp(secret));
    await page.getByRole("button", { name: /confirm and continue/i }).click();

    await expect(page).toHaveURL("/admin");
    await expect(
      page.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible();

    // Supabase now holds a verified factor for this user.
    const factors = await listFactors(staff.authUserId);
    expect(factors.some((f) => f.status === "verified")).toBe(true);
  });

  test("a wrong code is refused and the session stays unprivileged", async ({
    page,
  }) => {
    await signIn(page, staff);
    await expect(page).toHaveURL(/\/admin\/2fa/);

    await page.getByLabel(/six-digit code/i).fill("000000");
    await page.getByRole("button", { name: /confirm and continue/i }).click();

    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/2fa/);

    // Still walled off.
    await page.goto("/admin/products");
    await expect(page).toHaveURL(/\/admin\/2fa/);
  });

  test("an enrolled user is asked for a code on the next sign-in", async ({
    page,
    context,
  }) => {
    // Enrol once.
    await signIn(page, staff);
    await page.getByText(/can.t scan it/i).click();
    const secret = (await page.locator("code").first().innerText()).trim();
    if (secondsUntilNextWindow() < 5) await page.waitForTimeout(6000);
    await page.getByLabel(/six-digit code/i).fill(generateTotp(secret));
    await page.getByRole("button", { name: /confirm and continue/i }).click();
    await expect(page).toHaveURL("/admin");

    // Fresh browser state, same account.
    await context.clearCookies();
    await signIn(page, staff);

    // Verification, not enrolment — no QR this time.
    await expect(page).toHaveURL(/\/admin\/2fa/);
    await expect(
      page.getByRole("heading", { name: /^two-factor authentication$/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: /authenticator setup qr/i }),
    ).toBeHidden();

    // A NEW code from the same secret gets in.
    if (secondsUntilNextWindow() < 5) await page.waitForTimeout(6000);
    await page.getByLabel(/six-digit code/i).fill(generateTotp(secret));
    await page.getByRole("button", { name: /^verify$/i }).click();

    await expect(page).toHaveURL("/admin");
  });
});
