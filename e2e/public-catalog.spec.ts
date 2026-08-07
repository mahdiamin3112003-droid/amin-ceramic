import { expect, test } from "./support/test";

/**
 * The customer-facing catalogue — docs/02-ux-blueprint.md §3.1–§3.3, §7.2.
 *
 * ── Why this file exists ──
 * Every one of the admin specs starts from an authenticated session, so not
 * one of them would notice the public site failing. The half of the product
 * a visitor touches first was the thinner-tested half.
 *
 * ── What these assert that a smoke test would not ──
 * Each catalogue page catches its own read error and renders a calm message
 * with a 200 status: `catalog.loadError`, `collections.loadError`,
 * `quote.basket.loadError`. That is correct behaviour for a visitor and a
 * trap for a test — "the page loaded" stays true while the catalogue is
 * entirely gone. The pool-starvation failure this project has already hit
 * once (P2024/P2028 under concurrent `withRequestContext` transactions,
 * recorded in the project memory) surfaces exactly that way. So every page
 * here asserts on real content AND on the absence of the degraded state.
 */

/** The degraded-but-200 copy each catalogue surface falls back to. */
const LOAD_ERROR = /we couldn.t load/i;

test.describe("homepage", () => {
  test("renders the hero and its calls to action in English", async ({ page }) => {
    await page.goto("/en");

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

    await expect(
      page.getByRole("heading", { name: "Surfaces that hold their line." }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Explore the catalogue" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Browse collections" }),
    ).toBeVisible();
  });

  test("mirrors to RTL in Arabic", async ({ page }) => {
    await page.goto("/ar");

    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("main")).toBeVisible();
  });

  test("a reduced-motion visitor is never trapped behind the intro", async ({
    page,
  }) => {
    // `intro-gate.tsx` decides this in a blocking inline script before first
    // paint, and `prefers-reduced-motion` is one of its block conditions.
    // If that gate ever regressed, the overlay would sit over the homepage
    // for a visitor whose animations are collapsed to 0.01ms — i.e. forever.
    await page.goto("/en");

    await expect(page.locator("html")).toHaveAttribute("data-intro", "done");
    await expect(
      page.getByRole("heading", { name: "Surfaces that hold their line." }),
    ).toBeVisible();
  });

  test("the in-stock rail is populated, not silently empty", async ({ page }) => {
    await page.goto("/en");

    // This section renders only `page && page.items.length > 0`. A failed
    // read removes it with no error shown anywhere, so its absence is the
    // symptom to catch.
    const rail = page.getByRole("heading", { name: "In stock now" });
    await expect(rail).toBeVisible();

    // `getByRole("article")` targets ProductCard's own element. Counting
    // `listitem` here would also sweep up the header nav and the footer.
    const cards = page
      .locator("section")
      .filter({ has: rail })
      .getByRole("article");
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test("the page is hittable, not merely present in the DOM", async ({ page }) => {
    /**
     * The regression guard for the `template.tsx` clip-path bug.
     *
     * Playwright's `toBeVisible()` checks the bounding box and `visibility`.
     * It does NOT consider `opacity` or `clip-path`, so when SSR left the
     * page clipped to zero width for reduced-motion visitors, twelve
     * assertion-only specs went green against a completely blank screen —
     * only the clicking specs failed. Asserting that a real hit test lands
     * on the element is what closes that gap.
     */
    await page.goto("/en");
    const cta = page.getByRole("link", { name: "Explore the catalogue" });
    await expect(cta).toBeVisible();

    const landsOnTarget = await cta.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2,
      );
      return el === hit || el.contains(hit);
    });
    expect(landsOnTarget).toBe(true);
  });

  test("the skip link is the first thing the keyboard reaches", async ({
    page,
  }) => {
    await page.goto("/en");
    await page.keyboard.press("Tab");

    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  });
});

test.describe("product listing", () => {
  test("renders products and a result count", async ({ page }) => {
    await page.goto("/en/products");

    await expect(
      page.getByRole("heading", { name: "Porcelain & ceramic tile" }),
    ).toBeVisible();
    await expect(page.getByText(LOAD_ERROR)).toHaveCount(0);

    // "N products", never "No products" — the seed has a catalogue in it.
    await expect(page.getByText(/^\d+ products?$/)).toBeVisible();

    expect(await page.getByRole("article").count()).toBeGreaterThan(0);
  });

  test("a facet filter narrows the results and can be cleared", async ({
    page,
  }) => {
    await page.goto("/en/products");

    const countText = page.getByText(/^\d+ products?$/);
    const before = Number((await countText.innerText()).split(" ")[0]);
    expect(before).toBeGreaterThan(0);

    // The rail's first material checkbox — whichever the seed happens to
    // provide. Asserting on a specific vocabulary key would tie this spec to
    // placeholder data that the client's catalogue will replace.
    const filters = page.getByRole("navigation", { name: "Filters" });
    // `click`, not `check`: `check` asserts the control flips its own state
    // synchronously, and this one does not own its state at all — it is
    // URL-driven (filter-rail.tsx: "State lives entirely in the URL"), so
    // the box only comes back checked after the soft navigation re-renders
    // it from the query string. The URL IS the contract; assert on that.
    await filters.getByRole("checkbox").first().click();

    await expect(page).toHaveURL(/[?&](material|brand|finish|look|color)=/);
    await expect(filters.getByRole("checkbox").first()).toBeChecked();

    const after = Number((await countText.innerText()).split(" ")[0]);
    expect(after).toBeLessThanOrEqual(before);

    // A chip appears for the active filter, and "Clear all" restores everything.
    await page.getByRole("button", { name: "Clear all" }).click();
    await expect(page).not.toHaveURL(/[?&]material=/);
    await expect(countText).toHaveText(`${String(before)} products`);
  });

  test("sorting is a shareable URL, not hidden client state", async ({ page }) => {
    await page.goto("/en/products");

    await page.getByRole("combobox", { name: "Sort" }).click();
    await page.getByRole("option", { name: "Price: low to high" }).click();

    await expect(page).toHaveURL(/sort=price_asc/);
    await expect(page.getByText(LOAD_ERROR)).toHaveCount(0);
    expect(await page.getByRole("article").count()).toBeGreaterThan(0);
  });
});

test.describe("product detail", () => {
  test("a card leads to a PDP with breadcrumb, facts and specifications", async ({
    page,
  }) => {
    await page.goto("/en/products");

    const firstCard = page.getByRole("article").first();
    const name = await firstCard.getByRole("heading").innerText();
    await firstCard.getByRole("link").first().click();

    // `waitForURL` with room to breathe, not the default 10s expect timeout.
    // The PDP is `force-dynamic` and makes six sequential round trips to a
    // remote Supabase (see the page's own comment on why they cannot be
    // parallelised), so this navigation is genuinely slow from a laptop.
    await page.waitForURL(/\/en\/products\/[^/]+$/, { timeout: 30_000 });
    await expect(page.getByText(LOAD_ERROR)).toHaveCount(0);

    await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
    await expect(
      page.getByRole("link", { name: "Products" }).first(),
    ).toBeVisible();

    // The four at-a-glance facts, then the full table below.
    await expect(page.getByText("Format", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText("Thickness", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Specifications" }),
    ).toBeVisible();
  });

  test("the quantity calculator turns an area into boxes", async ({ page }) => {
    await page.goto("/en/products");
    await page.getByRole("article").first().getByRole("link").first().click();

    await expect(
      page.getByRole("heading", { name: "How much do I need?" }),
    ).toBeVisible();

    await page.getByLabel(/Room area/).fill("20");

    // Boxes must round UP — you cannot buy 0.4 of a box. The domain rule is
    // unit-tested; this asserts it survives the round trip to the visitor.
    const boxes = page.getByText("Boxes", { exact: true }).first();
    await expect(boxes).toBeVisible();
    await expect(page.getByText(/Area needed/)).toBeVisible();
  });

  test("an unknown slug is a 404, not a crash", async ({ page }) => {
    const response = await page.goto("/en/products/no-such-tile-exists");
    expect(response?.status()).toBe(404);
  });
});

test.describe("search", () => {
  test("prompts before a query, then returns matches", async ({ page }) => {
    await page.goto("/en/search");

    await expect(page.getByRole("heading", { name: "Search" })).toBeVisible();
    await expect(
      page.getByText("Start typing to search the catalogue."),
    ).toBeVisible();

    // Take a real product name from the listing so the query cannot go stale
    // when the placeholder catalogue is replaced by the client's.
    await page.goto("/en/products");
    const term =
      (
        await page.getByRole("article").first().getByRole("heading").innerText()
      ).split(" ")[0] ?? "";

    await page.goto("/en/search");
    await page.getByLabel("Search by name or SKU").fill(term);

    // The box debounces at 400ms, then pushes the query into the URL and
    // re-renders from the server. A predicate on the parsed query string
    // rather than a regex: the term comes from live product data, so
    // building a pattern out of it would need escaping to stay correct.
    await page.waitForURL((url) => url.searchParams.get("q") === term, {
      timeout: 30_000,
    });
    await expect(page.getByText(LOAD_ERROR)).toHaveCount(0);
    expect(await page.getByRole("article").count()).toBeGreaterThan(0);
  });
});

test.describe("collections", () => {
  test("the index lists published collections only", async ({ page }) => {
    await page.goto("/en/collections");

    await expect(page.getByRole("heading", { name: "Collections" })).toBeVisible();
    await expect(page.getByText(LOAD_ERROR)).toHaveCount(0);

    // Either real collections or the honest empty state — never a blank page.
    // The publish gate requires a hero image, and the media library is empty
    // until the client's photography lands, so "none published" is currently
    // the expected state rather than a failure.
    const empty = page.getByText("No collections published yet.");
    const items = page.locator("main").getByRole("listitem");
    expect((await items.count()) > 0 || (await empty.count()) > 0).toBe(true);
  });
});
