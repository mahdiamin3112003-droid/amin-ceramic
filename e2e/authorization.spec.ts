import { expect, test, type Page } from "@playwright/test";

import {
  createTestStaff,
  deleteTestStaff,
  type TestStaff,
} from "./support/staff-fixture";
import { generateTotp, secondsUntilNextWindow } from "./support/totp";

/**
 * Role-based authorisation, proven NEGATIVELY.
 *
 * The plan's requirement, verbatim: "Authorisation is proven negatively,
 * not just positively." A suite that only checks an owner can reach
 * everything would pass just as happily against a system with no
 * authorisation at all. What matters is that a viewer is refused.
 *
 * Every assertion runs against real seeded roles, real RLS claims and the
 * real permission check — nothing is mocked.
 */

/** Sign in, completing TOTP when the role requires it. */
async function signInFully(page: Page, staff: TestStaff): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(staff.email);
  await page.getByLabel("Password", { exact: true }).fill(staff.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Read-only roles land straight on the dashboard.
  await page.waitForURL(/\/admin(\/2fa)?(\?.*)?$/);
  if (!page.url().includes("/admin/2fa")) return;

  await page.getByText(/can.t scan it/i).click();
  const secret = (await page.locator("code").first().innerText()).trim();
  if (secondsUntilNextWindow() < 5) await page.waitForTimeout(6000);
  await page.getByLabel(/six-digit code/i).fill(generateTotp(secret));
  await page.getByRole("button", { name: /confirm and continue/i }).click();
  await page.waitForURL("/admin");
}

test.describe("viewer — read-only", () => {
  let staff: TestStaff;

  test.beforeEach(async ({ page }) => {
    staff = await createTestStaff("viewer");
    await signInFully(page, staff);
  });
  test.afterEach(async () => {
    await deleteTestStaff(staff);
  });

  test("sees only the sections its permissions cover", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Admin sections" });

    // viewer holds product.read and inventory.read.
    await expect(nav.getByRole("link", { name: "Products" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Inventory" })).toBeVisible();

    // It holds neither media.manage nor audit.read.
    await expect(nav.getByRole("link", { name: "Media" })).toBeHidden();
    await expect(nav.getByRole("link", { name: "Audit log" })).toBeHidden();
  });

  test("cannot reach the media library by typing the URL", async ({ page }) => {
    // Hiding the nav item is a courtesy; this is the control.
    await page.goto("/admin/media");
    await expect(page.getByRole("heading", { name: /didn.t work/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Media" })).toBeHidden();
  });

  test("cannot reach the audit log by typing the URL", async ({ page }) => {
    await page.goto("/admin/audit");
    await expect(page.getByRole("heading", { name: /didn.t work/i })).toBeVisible();
  });

  test("cannot open the product create form", async ({ page }) => {
    await page.goto("/admin/products/new");
    await expect(page.getByRole("heading", { name: /didn.t work/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "New product" })).toBeHidden();
  });

  test("is not offered a create button on the product list", async ({ page }) => {
    await page.goto("/admin/products");
    await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
    await expect(page.getByRole("link", { name: /new product/i })).toBeHidden();
  });

  test("is not offered the stock adjustment form", async ({ page }) => {
    await page.goto("/admin/inventory");
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
    // viewer has inventory.read but not inventory.adjust.
    await expect(
      page.getByRole("button", { name: /record movement/i }),
    ).toBeHidden();
  });
});

test.describe("editor — catalogue, but not everything", () => {
  let staff: TestStaff;

  test.beforeEach(async ({ page }) => {
    staff = await createTestStaff("editor");
    await signInFully(page, staff);
  });
  test.afterEach(async () => {
    await deleteTestStaff(staff);
  });

  test("reaches products and media", async ({ page }) => {
    await page.goto("/admin/products");
    await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();

    await page.goto("/admin/media");
    await expect(page.getByRole("heading", { name: "Media" })).toBeVisible();
  });

  test("may create products", async ({ page }) => {
    await page.goto("/admin/products/new");
    await expect(page.getByRole("heading", { name: "New product" })).toBeVisible();
  });

  test("cannot read the audit log", async ({ page }) => {
    // editor holds no audit.read — the log records what editors do.
    await page.goto("/admin/audit");
    await expect(page.getByRole("heading", { name: /didn.t work/i })).toBeVisible();
  });

  test("cannot adjust stock", async ({ page }) => {
    await page.goto("/admin/inventory");
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /record movement/i }),
    ).toBeHidden();
  });
});

test.describe("sales — the showroom floor", () => {
  let staff: TestStaff;

  test.beforeEach(async ({ page }) => {
    staff = await createTestStaff("sales");
    await signInFully(page, staff);
  });
  test.afterEach(async () => {
    await deleteTestStaff(staff);
  });

  test("may adjust stock", async ({ page }) => {
    await page.goto("/admin/inventory");
    // sales is the one non-admin role holding inventory.adjust.
    await expect(
      page.getByRole("button", { name: /record movement/i }),
    ).toBeVisible();
  });

  test("cannot create products", async ({ page }) => {
    await page.goto("/admin/products/new");
    await expect(page.getByRole("heading", { name: /didn.t work/i })).toBeVisible();
  });

  test("cannot reach the media library", async ({ page }) => {
    await page.goto("/admin/media");
    await expect(page.getByRole("heading", { name: /didn.t work/i })).toBeVisible();
  });
});

test.describe("owner — full access", () => {
  let staff: TestStaff;

  test.beforeEach(async ({ page }) => {
    staff = await createTestStaff("owner");
    await signInFully(page, staff);
  });
  test.afterEach(async () => {
    await deleteTestStaff(staff);
  });

  test("reaches every built section", async ({ page }) => {
    for (const [path, heading] of [
      ["/admin/products", "Products"],
      ["/admin/media", "Media"],
      ["/admin/inventory", "Inventory"],
      ["/admin/audit", "Audit log"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }
  });

  test("gets 404, never 403, for another tenant's product id", async ({ page }) => {
    // docs/04 §5.1: a 403 would confirm the id exists somewhere, which is
    // an enumeration oracle. A well-formed uuid that isn't ours must be
    // indistinguishable from one that never existed.
    await page.goto("/admin/products/00000000-0000-4000-8000-000000000000");
    await expect(page.getByRole("heading", { name: /not found/i })).toBeVisible();
  });
});

test.describe("account state", () => {
  test("a suspended account cannot sign in", async ({ page }) => {
    const staff = await createTestStaff("viewer");
    try {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();
      await prisma.appUser.update({
        where: { id: staff.appUserId },
        data: { status: "suspended" },
      });
      await prisma.$disconnect();

      await page.goto("/admin/login");
      await page.getByLabel("Email").fill(staff.email);
      await page.getByLabel("Password", { exact: true }).fill(staff.password);
      await page.getByRole("button", { name: "Sign in" }).click();

      // The Supabase credential is still valid — authority comes from the
      // AppUser row, and suspension takes effect on the very next request
      // because permissions are read per request (ADR-0012).
      await expect(page.getByRole("main").getByRole("alert")).toContainText(
        "Those details didn't work",
      );
      await expect(page).toHaveURL(/\/admin\/login/);
    } finally {
      await deleteTestStaff(staff);
    }
  });
});
