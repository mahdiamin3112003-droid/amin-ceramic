import { expect, test } from "./support/test";
import {
  createTestStaff,
  deleteTestStaff,
  type TestStaff,
} from "./support/staff-fixture";
import { signInFully } from "./support/sign-in";

/**
 * Collections and brands — docs/04 §14.1, docs/02 §1.2.
 *
 * The publish gate is the part worth machine-checking: it is stricter than
 * a product's, and the extra rules exist to stop a customer reaching a
 * collection page with nothing on it.
 */
test.describe("collections", () => {
  let staff: TestStaff | undefined;

  test.beforeEach(async ({ page }) => {
    // `editor` holds content.manage.
    staff = await createTestStaff("editor");
    await signInFully(page, staff);
  });
  test.afterEach(async () => {
    if (staff) await deleteTestStaff(staff);
    staff = undefined;
  });

  test("shows both tabs", async ({ page }) => {
    await page.goto("/admin/collections");
    await expect(page.getByRole("heading", { name: "Collections" })).toBeVisible();
    await expect(page.getByRole("tab", { name: /collections/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /brands/i })).toBeVisible();
  });

  test("a new collection starts as a draft and cannot be published empty", async ({
    page,
  }) => {
    await page.goto("/admin/collections");
    const slug = `e2e-col-${Date.now().toString(36)}`;

    await page.getByRole("button", { name: "New collection" }).click();
    await page.getByLabel("Slug").fill(slug);
    await page.getByLabel("Name (EN)").fill("E2E collection");
    await page.getByRole("button", { name: "Create", exact: true }).click();

    // The dialog closes only after the action resolves, so waiting for it to
    // go is how we know the list has been refreshed — asserting on the card
    // first races `router.refresh()`.
    await expect(page.getByRole("dialog")).toBeHidden();

    const card = page.getByRole("listitem").filter({ hasText: slug });
    await expect(card).toBeVisible();

    // Draft, and every publish blocker named on the card. Scoped to the
    // blockers list: the placeholder tile says "No hero image" too, for a
    // different reason.
    await expect(card.getByText("draft")).toBeVisible();
    const blockers = card.getByRole("list", { name: "Not ready to publish" });
    await expect(blockers.getByText(/no hero image/i)).toBeVisible();
    await expect(blockers.getByText(/no products/i)).toBeVisible();
    await expect(blockers.getByText(/missing ar name/i)).toBeVisible();

    // The button stays visible and disabled, with the reasons in its title —
    // a vanished button gives no clue where to look.
    const publish = card.getByRole("button", { name: "Publish" });
    await expect(publish).toBeDisabled();
    await expect(publish).toHaveAttribute("title", /no hero image/i);
  });

  test("a duplicate slug is refused", async ({ page }) => {
    await page.goto("/admin/collections");
    const slug = `e2e-dup-${Date.now().toString(36)}`;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await page.getByRole("button", { name: "New collection" }).click();
      await page.getByLabel("Slug").fill(slug);
      await page.getByLabel("Name (EN)").fill("E2E duplicate");
      await page.getByRole("button", { name: "Create", exact: true }).click();

      if (attempt === 0) {
        await expect(page.getByRole("dialog")).toBeHidden();
      }
    }

    // Second attempt: the dialog stays open and the clash is reported.
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});

test.describe("brands", () => {
  let staff: TestStaff | undefined;

  test.beforeEach(async ({ page }) => {
    staff = await createTestStaff("editor");
    await signInFully(page, staff);
  });
  test.afterEach(async () => {
    if (staff) await deleteTestStaff(staff);
    staff = undefined;
  });

  test("a brand in use cannot be hidden, and says why", async ({ page }) => {
    await page.goto("/admin/collections");
    await page.getByRole("tab", { name: /brands/i }).click();

    const inUse = page
      .getByRole("list", { name: "Brands" })
      .getByRole("listitem")
      .filter({ hasText: /[1-9]\d* products/ })
      .first();

    if ((await inUse.count()) > 0) {
      const hide = inUse.getByRole("button", { name: "Hide" });
      await expect(hide).toBeDisabled();
      await expect(hide).toHaveAttribute("title", /still carry this brand/i);
    }
  });

  test("the slug is immutable once created", async ({ page }) => {
    await page.goto("/admin/collections");
    await page.getByRole("tab", { name: /brands/i }).click();

    await page
      .getByRole("list", { name: "Brands" })
      .getByRole("listitem")
      .first()
      .getByRole("button", { name: "Edit" })
      .click();

    // Absent, not disabled — the slug is in published URLs.
    await expect(page.getByLabel("Slug")).toBeHidden();
    await expect(page.getByLabel("Name")).toBeVisible();
  });
});

test.describe("collections authorisation", () => {
  test("a viewer cannot reach collections", async ({ page }) => {
    const staff = await createTestStaff("viewer");
    try {
      await signInFully(page, staff);
      await page.goto("/admin/collections");
      await expect(
        page.getByRole("heading", { name: /didn.t work/i }),
      ).toBeVisible();
    } finally {
      await deleteTestStaff(staff);
    }
  });

  test("sales cannot reach collections", async ({ page }) => {
    const staff = await createTestStaff("sales");
    try {
      await signInFully(page, staff);
      await page.goto("/admin/collections");
      await expect(
        page.getByRole("heading", { name: /didn.t work/i }),
      ).toBeVisible();
    } finally {
      await deleteTestStaff(staff);
    }
  });
});
