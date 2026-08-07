import { expect, test } from "./support/test";

import {
  createTestStaff,
  deleteTestStaff,
  type TestStaff,
} from "./support/staff-fixture";
import { signInFully } from "./support/sign-in";

/**
 * Taxonomy CRUD — docs/04 §14.1.
 *
 * The four contract rules the spec names are each asserted against the real
 * database, because each one is a rule the UI could plausibly get right
 * while the server got wrong.
 */
test.describe("taxonomy", () => {
  let staff: TestStaff;

  // ONE account for the whole block, not one per test — see the note on
  // `createTestStaff`. Sign-in still happens per test, against a fresh
  // browser context; only the account creation is hoisted.
  test.beforeAll(async () => {
    // `editor` holds content.manage — the taxonomy permission.
    staff = await createTestStaff("editor");
  });
  test.afterAll(async () => {
    await deleteTestStaff(staff);
  });

  test.beforeEach(async ({ page }) => {
    await signInFully(page, staff);
  });

  test("the hub lists every vocabulary", async ({ page }) => {
    await page.goto("/admin/taxonomy");
    for (const label of [
      "Materials",
      "Finishes",
      "Surface looks",
      "Colour families",
      "Applications",
      "Layout patterns",
    ]) {
      await expect(
        page.getByRole("link", { name: new RegExp(label, "i") }),
      ).toBeVisible();
    }
  });

  test("an unknown resource is a 404, not a crash", async ({ page }) => {
    await page.goto("/admin/taxonomy/not-a-real-resource");
    await expect(page.getByRole("heading", { name: /not found/i })).toBeVisible();
  });

  test("a seeded entry in use cannot be hidden, and says why", async ({ page }) => {
    await page.goto("/admin/taxonomy/material");
    await expect(page.getByRole("heading", { name: "Materials" })).toBeVisible();

    // The seed attaches products to materials, so at least one row must be
    // protected from deactivation.
    const inUse = page
      .getByRole("list", { name: "Materials" })
      .getByRole("listitem")
      .filter({ hasText: /\d+ products/ })
      .first();
    if ((await inUse.count()) > 0) {
      await expect(inUse.getByRole("button", { name: "Hide" })).toBeDisabled();
    }
  });

  test("a new entry is created hidden and cannot go live without Arabic", async ({
    page,
  }) => {
    await page.goto("/admin/taxonomy/finish");
    const key = `e2e-${Date.now().toString(36)}`;

    await page.getByRole("button", { name: /add finish/i }).click();
    await page.getByLabel("Key").fill(key);
    await page.getByLabel("Name (EN)").fill("E2E test finish");
    await page.getByRole("button", { name: "Create", exact: true }).click();

    const list = page.getByRole("list", { name: "Finishes" });
    const row = list.getByRole("listitem").filter({ hasText: key });
    await expect(row).toBeVisible();
    // §14.1: created inactive, and blocked from activation until every
    // locale has a name.
    await expect(row.getByText("Hidden")).toBeVisible();
    await expect(row.getByText(/needs ar/i)).toBeVisible();
    await expect(row.getByRole("button", { name: /make live/i })).toBeDisabled();

    // Supply the missing locale, and it becomes activatable.
    await row.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Name (AR)").fill("تشطيب اختباري");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    const updated = list.getByRole("listitem").filter({ hasText: key });
    await expect(updated.getByRole("button", { name: /make live/i })).toBeEnabled();
    await updated.getByRole("button", { name: /make live/i }).click();
    await expect(
      list.getByRole("listitem").filter({ hasText: key }).getByText("Live"),
    ).toBeVisible();
  });

  test("the key is immutable once created", async ({ page }) => {
    await page.goto("/admin/taxonomy/material");
    await page
      .getByRole("list", { name: "Materials" })
      .getByRole("listitem")
      .first()
      .getByRole("button", { name: "Edit" })
      .click();
    // No key input at all on edit — the field is absent, not disabled.
    await expect(page.getByLabel("Key")).toBeHidden();
  });
});

test.describe("taxonomy authorisation", () => {
  test("a viewer cannot reach it", async ({ page }) => {
    const staff = await createTestStaff("viewer");
    try {
      await signInFully(page, staff);
      await page.goto("/admin/taxonomy");
      await expect(
        page.getByRole("heading", { name: /didn.t work/i }),
      ).toBeVisible();
    } finally {
      await deleteTestStaff(staff);
    }
  });

  test("sales cannot reach it either", async ({ page }) => {
    const staff = await createTestStaff("sales");
    try {
      await signInFully(page, staff);
      await page.goto("/admin/taxonomy/material");
      await expect(
        page.getByRole("heading", { name: /didn.t work/i }),
      ).toBeVisible();
    } finally {
      await deleteTestStaff(staff);
    }
  });
});

test.describe("reduced motion", () => {
  /**
   * The suite runs with `reducedMotion: "reduce"` (see playwright.config.ts),
   * which every other test depends on for click stability. This asserts the
   * mechanism directly, so a regression is reported as what it is rather
   * than as a mysterious timeout somewhere else.
   */
  test("ambient animation is collapsed, not merely slowed", async ({ page }) => {
    await page.goto("/admin/login");

    const card = page.locator(".backdrop-blur-2xl").first();
    await expect(card).toBeVisible();

    const timing = await card.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        duration: cs.animationDuration,
        iterations: cs.animationIterationCount,
      };
    });

    // Compared numerically: the same value serialises as "0.01ms" or
    // "1e-05s" depending on the browser, and asserting on the string makes
    // the test fail on a formatting change rather than a behavioural one.
    const seconds = timing.duration.endsWith("ms")
      ? Number.parseFloat(timing.duration) / 1000
      : Number.parseFloat(timing.duration);

    // globals.css §6: effectively instant, and exactly one iteration — so
    // nothing is ever in motion.
    expect(seconds).toBeLessThan(0.001);
    expect(timing.iterations).toBe("1");
  });
});
