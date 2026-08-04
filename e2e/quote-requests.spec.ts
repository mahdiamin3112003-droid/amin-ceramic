import { expect, test } from "./support/test";
import {
  createTestQuoteRequest,
  createTestStaff,
  deleteTestQuoteRequest,
  deleteTestStaff,
  type TestQuote,
  type TestStaff,
} from "./support/staff-fixture";
import { signInFully } from "./support/sign-in";

/**
 * The quote-requests board — docs/02 §2.6's daily loop.
 *
 * The status machine these exercise is derived rather than specified (see
 * `domain/admin/quote-request.ts`), which makes machine-checking it more
 * important than usual: there is no document to fall back on if it drifts.
 */
test.describe("board", () => {
  let staff: TestStaff | undefined;
  let quote: TestQuote | undefined;

  test.beforeEach(async ({ page }) => {
    // `sales` is the showroom role: request.read + request.respond.
    staff = await createTestStaff("sales");
    quote = await createTestQuoteRequest("submitted");
    await signInFully(page, staff);
  });
  test.afterEach(async () => {
    // Guarded: a beforeEach that threw partway leaves one of these unset,
    // and an exception in teardown masks the real failure.
    if (quote) await deleteTestQuoteRequest(quote);
    if (staff) await deleteTestStaff(staff);
    quote = undefined;
    staff = undefined;
  });

  /**
   * The fixture's reference, asserted present.
   *
   * `quote` is optional so teardown can run after a failed setup; this is
   * the one place that narrowing happens, rather than a `!` at every use.
   */
  function ref(): string {
    if (!quote) throw new Error("quote fixture was not created");
    return quote.reference;
  }

  test("shows the four live columns and the card in the right one", async ({
    page,
  }) => {
    await page.goto("/admin/requests");

    for (const column of ["New", "Acknowledged", "Quoted", "Negotiating"]) {
      await expect(
        page.getByRole("heading", { name: column, exact: true }),
      ).toBeVisible();
    }

    // A submitted request belongs under "New".
    await expect(
      page.getByRole("list", { name: "New" }).getByText(ref()),
    ).toBeVisible();
  });

  test("offers only the legal moves for the card's status", async ({ page }) => {
    await page.goto("/admin/requests");
    const card = page.getByRole("listitem").filter({ hasText: ref() });

    // submitted → acknowledged | quoted | lost | cancelled
    await expect(card.getByRole("button", { name: "Acknowledged" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Quoted" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Lost" })).toBeVisible();
    // …and NOT the ones the machine forbids from `submitted`.
    await expect(card.getByRole("button", { name: "Won" })).toBeHidden();
    await expect(card.getByRole("button", { name: "Negotiating" })).toBeHidden();
  });

  test("moving a card asks first, then moves it", async ({ page }) => {
    await page.goto("/admin/requests");
    const card = page.getByRole("listitem").filter({ hasText: ref() });

    await card.getByRole("button", { name: "Acknowledged" }).click();
    // A status change is customer-visible work, so it is confirmed.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Move", exact: true }).click();

    // The dialog closes only after the action resolves, so waiting for it
    // to go is how we know the board has been refreshed — asserting on the
    // columns first races `router.refresh()`.
    await expect(dialog).toBeHidden();

    await expect(
      page.getByRole("list", { name: "Acknowledged" }).getByText(ref()),
    ).toBeVisible();
    await expect(
      page.getByRole("list", { name: "New" }).getByText(ref()),
    ).toBeHidden();
  });

  test("marking a request lost demands a reason", async ({ page }) => {
    await page.goto("/admin/requests");
    const card = page.getByRole("listitem").filter({ hasText: ref() });

    await card.getByRole("button", { name: "Lost" }).click();
    const dialog = page.getByRole("dialog");

    // The move is refused until a reason is chosen — this is the field that
    // turns dead quotes into something a business can act on.
    await expect(
      dialog.getByRole("button", { name: "Move", exact: true }),
    ).toBeDisabled();
    await dialog.getByLabel("Reason").selectOption("price");
    await expect(
      dialog.getByRole("button", { name: "Move", exact: true }),
    ).toBeEnabled();

    await dialog.getByRole("button", { name: "Move", exact: true }).click();
    await expect(dialog).toBeHidden();

    // Lost is not a board column, so the card leaves the board entirely.
    // Asserted on the card's LINK rather than on the text: the dialog title
    // also contains the reference, so a bare text match is ambiguous while
    // the dialog is still on screen.
    await expect(page.getByRole("link", { name: ref() })).toBeHidden();
  });

  test("the detail view shows snapshots and the contact", async ({ page }) => {
    await page.goto("/admin/requests");
    await page.getByRole("link", { name: ref() }).click();

    await expect(page.getByRole("heading", { name: ref() })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Contact" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Items" })).toBeVisible();
    await expect(page.getByText("e2e@example.invalid")).toBeVisible();
  });

  test("another tenant's id is a 404, not a 403", async ({ page }) => {
    await page.goto("/admin/requests/00000000-0000-4000-8000-000000000000");
    await expect(page.getByRole("heading", { name: /not found/i })).toBeVisible();
  });
});

test.describe("board authorisation", () => {
  let quote: TestQuote | undefined;

  test.beforeEach(async () => {
    quote = await createTestQuoteRequest("submitted");
  });
  test.afterEach(async () => {
    if (quote) await deleteTestQuoteRequest(quote);
    quote = undefined;
  });

  /**
   * The fixture's reference, asserted present.
   *
   * `quote` is optional so teardown can run after a failed setup; this is
   * the one place that narrowing happens, rather than a `!` at every use.
   */
  function ref(): string {
    if (!quote) throw new Error("quote fixture was not created");
    return quote.reference;
  }

  test("a viewer can read the pipeline but not move anything", async ({ page }) => {
    const staff = await createTestStaff("viewer");
    try {
      await signInFully(page, staff);
      await page.goto("/admin/requests");

      // viewer holds request.read …
      await expect(
        page.getByRole("heading", { name: "Quote requests" }),
      ).toBeVisible();
      await expect(page.getByText(ref())).toBeVisible();

      // … but not request.respond, so no card offers a move.
      const card = page.getByRole("listitem").filter({ hasText: ref() });
      await expect(card.getByRole("button", { name: "Acknowledged" })).toBeHidden();
      await expect(page.getByText(/read the pipeline but not move/i)).toBeVisible();
    } finally {
      await deleteTestStaff(staff);
    }
  });

  test("an editor cannot reach it at all", async ({ page }) => {
    const staff = await createTestStaff("editor");
    try {
      await signInFully(page, staff);
      await page.goto("/admin/requests");
      // editor holds neither request.read nor request.respond.
      await expect(
        page.getByRole("heading", { name: /didn.t work/i }),
      ).toBeVisible();
    } finally {
      await deleteTestStaff(staff);
    }
  });
});
