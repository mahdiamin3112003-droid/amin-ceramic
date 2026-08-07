import type { Page } from "@playwright/test";

import { expect, test } from "./support/test";
import {
  TEST_SUBMISSION_EMAIL,
  TEST_SUBMISSION_NAME,
} from "./support/staff-fixture";

/**
 * The quote path — docs/02-ux-blueprint.md §3.6–§3.7, docs/04 §11.2.
 *
 * This is the site's conversion flow: it is the only thing a visitor can
 * *do* here, since there is no checkout. Everything in it hangs off the
 * `ac_vid` visitor cookie the middleware mints, so these also serve as the
 * end-to-end proof that anonymous identity survives a multi-page journey —
 * which nothing else in the suite covers (every admin spec is authenticated).
 *
 * ── On the rows these leave behind ──
 * The submission test goes through the real Server Action, so it mints a
 * real `AC-<year>-…` reference and lands on the admin board like any other
 * enquiry. `purgeSubmittedTestQuotes` in global teardown sweeps them by
 * contact identity; `TEST_SUBMISSION_NAME`/`_EMAIL` are imported rather than
 * retyped so the spec and the sweep can never drift apart.
 */

/** Put one product in the basket via the listing card's "+" action. */
async function addFirstProductToBasket(page: Page) {
  await page.goto("/en/products");
  await page
    .getByRole("article")
    .first()
    .getByRole("button", { name: "Add to basket" })
    .click();
  // The toast is the action's completion signal — navigating before it
  // arrives races the server action and intermittently finds an empty basket.
  await expect(page.getByText("Added to basket")).toBeVisible();
}

test.describe("basket", () => {
  test("is empty for a new visitor, and says so usefully", async ({ page }) => {
    await page.goto("/en/basket");

    await expect(page.getByRole("heading", { name: "Your basket" })).toBeVisible();
    await expect(page.getByText("Your basket is empty.")).toBeVisible();
    // An empty state with no way out is a dead end.
    await expect(page.getByRole("link", { name: "Browse products" })).toBeVisible();
  });

  test("a quick add survives the navigation to the basket", async ({ page }) => {
    await addFirstProductToBasket(page);
    await page.goto("/en/basket");

    await expect(page.getByText("Your basket is empty.")).toHaveCount(0);
    await expect(page.getByLabel("Quantity (m²)")).toBeVisible();
    await expect(page.getByText(/Subtotal:/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Request a quote" })).toBeVisible();
  });

  test("changing the quantity recomputes boxes and the subtotal", async ({
    page,
  }) => {
    await addFirstProductToBasket(page);
    await page.goto("/en/basket");

    const quantity = page.getByLabel("Quantity (m²)");
    const subtotalBefore = await page.getByText(/Subtotal:/).innerText();

    // The row commits on blur, not on every keystroke.
    await quantity.fill("60");
    await quantity.blur();

    await expect(page.getByText(/Subtotal:/)).not.toHaveText(subtotalBefore);
    // Boxes round UP — the domain rule, seen from the visitor's side.
    await expect(page.getByText(/\d+ bx/)).toBeVisible();
  });

  test("removing the last item returns the empty state", async ({ page }) => {
    await addFirstProductToBasket(page);
    await page.goto("/en/basket");

    await page.getByRole("button", { name: "Remove item" }).click();

    await expect(page.getByText("Your basket is empty.")).toBeVisible();
  });
});

test.describe("quote request", () => {
  test("refuses a submission with no name and no way to reply", async ({
    page,
  }) => {
    await addFirstProductToBasket(page);
    await page.goto("/en/basket/request");

    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByText("Please enter your name.")).toBeVisible();

    // A name alone still leaves us unable to answer.
    await page.getByLabel(/Full name/).fill(TEST_SUBMISSION_NAME);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(
      page.getByText("Please provide an email or phone number."),
    ).toBeVisible();

    // Still on the form — a rejected submit must not navigate.
    await expect(page).toHaveURL(/\/basket\/request$/);
  });

  test("a complete request reaches the confirmation page with a reference", async ({
    page,
  }) => {
    await addFirstProductToBasket(page);
    await page.goto("/en/basket/request");

    await page.getByLabel(/Full name/).fill(TEST_SUBMISSION_NAME);
    await page.getByLabel(/^Email/).fill(TEST_SUBMISSION_EMAIL);
    await page.getByRole("button", { name: "Send request" }).click();

    await expect(page).toHaveURL(
      /\/basket\/request\/sent\/[A-Z]{2,4}-\d{4}-\d{3,6}/,
    );
    await expect(
      page.getByRole("heading", { name: "Request received" }),
    ).toBeVisible();

    // The reference is the only thing the visitor can quote back at us, so
    // it has to be on the page, not merely in the URL.
    await expect(page.getByText(/Reference:/)).toBeVisible();
    const reference = /\/sent\/([^/?]+)/.exec(page.url())?.[1] ?? "";
    expect(reference).toMatch(/^[A-Z]{2,4}-\d{4}-\d{3,6}$/);
    await expect(page.getByText(reference)).toBeVisible();
  });

  test("the honeypot field is hidden from real visitors", async ({ page }) => {
    await page.goto("/en/basket/request");

    // Present in the DOM for bots, unreachable by keyboard and hidden from
    // assistive tech. If it ever became visible, real submissions would
    // start being silently discarded server-side.
    const honeypot = page.locator("#website");
    await expect(honeypot).toBeAttached();
    await expect(honeypot).toBeHidden();
    await expect(honeypot).toHaveAttribute("tabindex", "-1");
  });
});

test.describe("compare", () => {
  test("asks for more when fewer than two products are given", async ({ page }) => {
    await page.goto("/en/compare");

    await expect(
      page.getByRole("heading", { name: "Compare tiles" }),
    ).toBeVisible();
    await expect(
      page.getByText("Select at least two products to compare."),
    ).toBeVisible();
  });

  test("two products selected from the grid render a comparison table", async ({
    page,
  }) => {
    await page.goto("/en/products");

    const cards = page.getByRole("article");
    await cards.nth(0).getByRole("button", { name: "Add to compare" }).click();
    await cards.nth(1).getByRole("button", { name: "Add to compare" }).click();

    // The tray is the spec's persistent bottom bar (docs/02 §3.2).
    await expect(page.getByText("2 selected")).toBeVisible();
    await page.getByRole("link", { name: /Compare/ }).click();

    await expect(page).toHaveURL(/\/compare\?ids=/);
    await expect(page.getByRole("table")).toBeVisible();

    // The grouped spec rows are the point of the screen.
    await expect(page.getByText("Dimensions", { exact: true })).toBeVisible();
    await expect(page.getByText("Performance", { exact: true })).toBeVisible();

    // Two product columns plus the sticky label column.
    expect(await page.getByRole("columnheader").count()).toBe(3);
  });

  test("the toggle is a real pressed state, not a one-way action", async ({
    page,
  }) => {
    await page.goto("/en/products");
    const first = page.getByRole("article").first();

    const toggle = first.getByRole("button", { name: "Add to compare" });
    await toggle.click();

    const pressed = first.getByRole("button", { name: "Remove from compare" });
    await expect(pressed).toHaveAttribute("aria-pressed", "true");

    await pressed.click();
    await expect(page.getByText(/\d+ selected/)).toHaveCount(0);
  });
});

test.describe("wishlist", () => {
  test("a saved tile survives the navigation to the wishlist", async ({ page }) => {
    await page.goto("/en/products");
    const first = page.getByRole("article").first();
    const name = await first.getByRole("heading").innerText();

    await first.getByRole("button", { name: "Add to wishlist" }).click();

    const saved = first.getByRole("button", { name: "Remove from wishlist" });
    await expect(saved).toBeVisible();
    // The heart is optimistic: the label flips synchronously, before the
    // Server Action has written anything. `disabled` is the pending flag, so
    // waiting for it to clear is what proves the write actually landed —
    // navigating on the label alone aborts the request in flight.
    await expect(saved).toBeEnabled();

    await page.goto("/en/wishlist");
    await expect(page.getByRole("heading", { name: "Wishlist" })).toBeVisible();
    await expect(page.getByText("You haven't saved any tiles yet.")).toHaveCount(0);
    await expect(page.getByRole("article").getByText(name).first()).toBeVisible();
  });
});
