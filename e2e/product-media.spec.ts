import type { Page } from "@playwright/test";

import { expect, test } from "./support/test";

import { getSharedTestStaff, type TestStaff } from "./support/staff-fixture";
import { signInFully } from "./support/sign-in";

/**
 * The product form's `#media` tab — docs/02 §1.2.
 *
 * ── Why this file exists ──
 * The attach and detach server actions, their use-cases and their
 * repository functions were all built in Phase 4 and all tested. Nothing in
 * the UI called them. Every admin spec passed, the media library passed,
 * product CRUD passed — and a product still could not be given an image
 * through any screen. Tests over layers do not add up to a test over the
 * journey, and this file is the journey.
 */
test.describe("product media tab", () => {
  let staff: TestStaff;

  test.beforeAll(async () => {
    // `editor` holds both product.update and media.manage.
    staff = await getSharedTestStaff("editor");
  });

  test.beforeEach(async ({ page }) => {
    await signInFully(page, staff);
  });

  /**
   * Open the first product in the list and switch to its Media tab.
   *
   * Scoped by href inside `tbody`, not by accessible name: the row link is
   * labelled with the PRODUCT NAME, which is seed data and will be replaced
   * by the client's catalogue. Matching on the name made this helper time
   * out on every test that used it.
   */
  async function openMediaTab(page: Page) {
    await page.goto("/admin/products");
    await page.locator('tbody a[href^="/admin/products/"]').first().click();
    await page.waitForURL(/\/admin\/products\/[0-9a-f-]{36}$/, {
      timeout: 30_000,
    });
    await page.getByRole("tab", { name: "Media" }).click();
  }

  test("the tab exists and is reachable", async ({ page }) => {
    await openMediaTab(page);
    await expect(
      page.getByRole("heading", { name: "Attached images" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Add an image" })).toBeVisible();
  });

  test("it says plainly that image changes do not wait for Save", async ({
    page,
  }) => {
    // The editor is save-on-submit everywhere else. That difference is a
    // real trap, so the warning is part of the contract, not decoration.
    await openMediaTab(page);
    await expect(page.getByText(/save immediately/i)).toBeVisible();
  });

  test("an empty library says where to go rather than showing a dead picker", async ({
    page,
  }) => {
    await openMediaTab(page);

    const emptyNotice = page.getByText(/media library is empty/i);
    const picker = page.getByLabel("Image", { exact: true });

    // Whichever state the environment is in, exactly one of these must be
    // true — a picker with nothing in it is the failure mode being ruled out.
    const isEmpty = (await emptyNotice.count()) > 0;
    if (isEmpty) {
      await expect(emptyNotice).toBeVisible();
      await expect(
        emptyNotice.getByRole("link", { name: /media library/i }),
      ).toBeVisible();
    } else {
      await expect(picker).toBeVisible();
      await expect(page.getByRole("button", { name: "Attach" })).toBeVisible();
    }
  });

  test("every role in the schema is offered, including the drawing", async ({
    page,
  }) => {
    await openMediaTab(page);

    const role = page.getByLabel("Role", { exact: true });
    if ((await role.count()) === 0) {
      // No library to attach from in this environment; the role list only
      // renders beside a usable picker.
      test.skip();
      return;
    }

    // `technical_drawing` and `packaging` were absent from the attach schema
    // and therefore unattachable, while docs/02 §3.3's PDP thumbnail strip
    // names the drawing explicitly. Asserted so they cannot quietly go
    // missing again.
    for (const label of [
      "Primary",
      "Gallery",
      "Room scene",
      "Macro detail",
      "Installed",
      "Technical drawing",
      "Packaging",
      "Swatch",
    ]) {
      await expect(role.getByRole("option", { name: label })).toHaveCount(1);
    }
  });

  test("the media tab does not disturb the rest of the form on save", async ({
    page,
  }) => {
    /**
     * The panel lives inside the product form's single `<form>`. Its
     * controls carry no `name` for exactly that reason — a named select
     * would be swept into FormData and rejected by the product schema. This
     * asserts the save path still works with the tab present.
     */
    await openMediaTab(page);
    await page.getByRole("tab", { name: "Basics" }).click();

    await page.getByRole("button", { name: /^Save/ }).click();
    await expect(page.getByText(/^Saved$/)).toBeVisible({ timeout: 30_000 });
  });

  test("a new product says to save first rather than offering a broken picker", async ({
    page,
  }) => {
    // Attaching needs a product id, which does not exist before the first
    // save. The tab is present but honest about it.
    await page.goto("/admin/products/new");
    await page.getByRole("tab", { name: "Media" }).click();
    await expect(page.getByText(/save the product first/i)).toBeVisible();
  });
});

/**
 * NOT TESTED HERE, deliberately: the panel's "your role cannot manage
 * media" branch.
 *
 * No seeded role can reach it. `product.update` is held only by `owner`,
 * `admin` and `editor` (prisma/seed.ts), and all three also hold
 * `media.manage` — so with the shipped roles there is no account that can
 * edit a product but not its images. The branch exists for a CUSTOM role
 * built through role management, which the e2e suite does not create.
 *
 * Writing a test against `sales` here would have looked like coverage and
 * proved nothing: `sales` holds `product.read`, so it reaches the product
 * LIST perfectly well, and the first version of this file asserted it was
 * refused. That assertion was simply wrong.
 */
