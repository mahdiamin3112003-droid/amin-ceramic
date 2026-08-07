import { expect, test } from "./support/test";
import {
  createTestStaff,
  deleteTestStaff,
  type TestStaff,
} from "./support/staff-fixture";
import { signInFully } from "./support/sign-in";

/**
 * Settings, staff and trade accounts — docs/04 §14.5.
 *
 * The lockout guards have unit coverage in `domain/admin/people.test.ts`;
 * what these add is that the guard is actually WIRED — that the owner-only
 * gate and the self-protection reach the rendered page rather than sitting
 * in a pure function nobody calls.
 */
test.describe("settings as an owner", () => {
  let staff: TestStaff | undefined;

  // One owner for the block — these tests read settings and act on OTHER
  // people's records, never on this account itself.
  test.beforeAll(async () => {
    staff = await createTestStaff("owner");
  });
  test.afterAll(async () => {
    if (staff) await deleteTestStaff(staff);
    staff = undefined;
  });

  test.beforeEach(async ({ page }) => {
    if (staff) await signInFully(page, staff);
  });

  test("the three sections are reachable", async ({ page }) => {
    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    await page.getByRole("link", { name: "Staff & roles" }).click();
    await expect(
      page.getByRole("heading", { name: "Staff & roles" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Trade accounts" }).click();
    await expect(
      page.getByRole("heading", { name: "Trade accounts" }),
    ).toBeVisible();
  });

  test("an owner cannot suspend their own account", async ({ page }) => {
    await page.goto("/admin/settings/users");

    const ownRow = page.getByRole("row").filter({ hasText: staff?.email ?? "" });
    const suspend = ownRow.getByRole("button", { name: "Suspend" });

    // The guard reaches the button, and the button carries its reason.
    await expect(suspend).toBeDisabled();
    await expect(suspend).toHaveAttribute("title", /your own account/i);
  });

  test("an owner cannot reset their own authenticator", async ({ page }) => {
    await page.goto("/admin/settings/users");

    const ownRow = page.getByRole("row").filter({ hasText: staff?.email ?? "" });
    const reset = ownRow.getByRole("button", { name: /reset 2fa/i });

    // What stops a stolen session clearing its own second factor.
    await expect(reset).toBeDisabled();
    await expect(reset).toHaveAttribute("title", /your own authenticator/i);
  });

  test("removing your own owner role is refused, with the reason shown", async ({
    page,
  }) => {
    await page.goto("/admin/settings/users");

    const ownRow = page.getByRole("row").filter({ hasText: staff?.email ?? "" });
    await ownRow.getByRole("button", { name: "Roles" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // By NAME, not position: roles are listed in key order, so `.first()`
    // is "admin" and unticking it proves nothing.
    await dialog.getByRole("checkbox", { name: /owner/i }).uncheck();

    await expect(dialog.getByRole("alert")).toContainText(/your own owner role/i);
    await expect(
      dialog.getByRole("button", { name: /save roles/i }),
    ).toBeDisabled();
  });
});

test.describe("settings authorisation", () => {
  test("an editor cannot reach settings at all", async ({ page }) => {
    const staff = await createTestStaff("editor");
    try {
      await signInFully(page, staff);
      await page.goto("/admin/settings");
      // editor holds neither settings.write nor user.manage.
      await expect(
        page.getByRole("heading", { name: /didn.t work/i }),
      ).toBeVisible();
    } finally {
      await deleteTestStaff(staff);
    }
  });

  test("an admin reaches settings but role changes stay owner-only", async ({
    page,
  }) => {
    // `admin` holds every permission except role.manage and tenant.manage,
    // so it is the case that proves the owner gate is a ROLE check and not
    // just a permission check.
    const staff = await createTestStaff("admin");
    try {
      await signInFully(page, staff);

      await page.goto("/admin/settings/users");
      await expect(
        page.getByRole("heading", { name: "Staff & roles" }),
      ).toBeVisible();

      // The Roles button is owner-only, so it is not rendered at all.
      const ownRow = page.getByRole("row").filter({ hasText: staff.email });
      await expect(ownRow.getByRole("button", { name: "Roles" })).toBeHidden();
      await expect(ownRow.getByRole("button", { name: /reset 2fa/i })).toBeHidden();
    } finally {
      await deleteTestStaff(staff);
    }
  });

  test("a viewer cannot reach the staff list", async ({ page }) => {
    const staff = await createTestStaff("viewer");
    try {
      await signInFully(page, staff);
      await page.goto("/admin/settings/users");
      await expect(
        page.getByRole("heading", { name: /didn.t work/i }),
      ).toBeVisible();
    } finally {
      await deleteTestStaff(staff);
    }
  });
});
