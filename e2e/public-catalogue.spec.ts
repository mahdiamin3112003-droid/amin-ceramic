import { expect, test } from "./support/test";

/**
 * The catalogue page-turn view — `/collections/[slug]/catalogue` (ADR-0017).
 *
 * ── Why these exist in the browser and not as unit tests ──
 * Everything this view promises is positional: that a turn actually lands,
 * that the URL follows it, that Back steps back exactly one page, and that
 * the controls are reachable. None of that is observable from JSDOM.
 *
 * A note on what this suite can and cannot see: it runs under
 * `prefers-reduced-motion: reduce` (see support/test.ts), so the page takes
 * the reduced path in `[locale]/template.tsx` and in the view itself. That
 * is the right default — it is the path most likely to be silently broken,
 * as this project has already learned once — but it does mean a regression
 * in the FULL-motion wipe would not fail here.
 */

/**
 * A REAL collection, not the old `calacatta-series` seed row — that one was
 * archived once the client's own collections existed, and an archived
 * collection 404s publicly, which would have failed every spec in this file.
 * `concrete` is the largest (five products), so the turn, the ends and the
 * deep-link specs all have somewhere to go.
 */
const COLLECTION = "concrete";
const CATALOGUE = `/en/collections/${COLLECTION}/catalogue`;

test.describe("catalogue view", () => {
  test("is reachable from the collection page", async ({ page }) => {
    await page.goto(`/en/collections/${COLLECTION}`);

    await page.getByRole("link", { name: "Browse as catalogue" }).click();

    await page.waitForURL(/\/collections\/[^/]+\/catalogue/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("opens on the first tile and says where you are", async ({ page }) => {
    await page.goto(CATALOGUE);

    await expect(page.getByText(/^1 \/ \d+$/)).toBeVisible();
    // The announcement is what a screen-reader user navigates by (§7.2).
    await expect(page.getByText(/^Page 1 of \d+\./)).toBeAttached();
  });

  /**
   * The photograph is the whole point of a showroom view, and it was missing
   * for four days without anything failing.
   *
   * This view was built before the client's photos existed and drew a
   * `colorHex` swatch as an honest placeholder. When real photos landed, the
   * grid card and the PDP were wired up and THIS was not — the stale "until
   * the photography lands" comment made it look intentional. The same
   * omission had already happened on the compare page.
   *
   * `naturalWidth > 0` rather than `toBeVisible()`, deliberately: an <img>
   * whose src 404s is still "visible" to Playwright, and a broken image is
   * exactly the regression worth catching. This file's own hit-test spec
   * below exists for the sibling lesson.
   */
  test("shows the tile's real photograph, and it actually loads", async ({
    page,
  }) => {
    await page.goto(CATALOGUE);

    const photo = page.locator("main article img").first();
    await expect(photo).toBeAttached();

    await expect
      .poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth), {
        message: "the catalogue photo never finished loading",
      })
      .toBeGreaterThan(0);
  });

  /**
   * The regression guard, and the reason this file exists at all.
   *
   * `toBeVisible()` considers neither `opacity` nor `clip-path`, which is how
   * a completely blank public site once passed twelve specs. A page-turn view
   * whose Next control cannot actually be hit is the same failure wearing a
   * different hat, so this asserts a real hit test rather than visibility.
   */
  test("the turn controls are hittable, not merely present", async ({ page }) => {
    await page.goto(CATALOGUE);

    for (const label of ["Next tile", "Close catalogue"]) {
      const control = page.getByRole(control_role(label), { name: label });
      await expect(control).toBeVisible();

      const lands = await control.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2,
        );
        return el === hit || el.contains(hit);
      });
      expect(lands, `${label} is covered or off-screen`).toBe(true);
    }
  });

  test("turning forward changes the tile and the URL together", async ({
    page,
  }) => {
    await page.goto(CATALOGUE);
    const first = await page.getByRole("heading", { level: 1 }).innerText();

    await page.getByRole("button", { name: "Next tile" }).click();

    await expect(page.getByText(/^2 \/ \d+$/)).toBeVisible();
    await expect(page).toHaveURL(/[?&]tile=/);
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(first);
  });

  /**
   * §3.2 rejects infinite scroll partly to protect the back button. A turn
   * that did not push history would give this view the same defect.
   */
  test("Back steps back exactly one page", async ({ page }) => {
    await page.goto(CATALOGUE);

    await page.getByRole("button", { name: "Next tile" }).click();
    await expect(page.getByText(/^2 \/ \d+$/)).toBeVisible();
    await page.getByRole("button", { name: "Next tile" }).click();
    await expect(page.getByText(/^3 \/ \d+$/)).toBeVisible();

    await page.goBack();
    await expect(page.getByText(/^2 \/ \d+$/)).toBeVisible();
  });

  test("a deep link opens on the tile it names", async ({ page }) => {
    await page.goto(CATALOGUE);
    await page.getByRole("button", { name: "Next tile" }).click();
    await expect(page.getByText(/^2 \/ \d+$/)).toBeVisible();

    const url = page.url();
    const name = await page.getByRole("heading", { level: 1 }).innerText();

    await page.goto(url);
    await expect(page.getByText(/^2 \/ \d+$/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  });

  test("arrow keys turn, and Home and End jump to the ends", async ({ page }) => {
    await page.goto(CATALOGUE);

    await page.keyboard.press("ArrowRight");
    await expect(page.getByText(/^2 \/ \d+$/)).toBeVisible();

    await page.keyboard.press("ArrowLeft");
    await expect(page.getByText(/^1 \/ \d+$/)).toBeVisible();

    await page.keyboard.press("End");
    const position = page.getByText(/^\d+ \/ \d+$/);
    const atEnd = await position.innerText();
    const [current, total] = atEnd.split(" / ");
    expect(current).toBe(total);

    await page.keyboard.press("Home");
    await expect(page.getByText(/^1 \/ \d+$/)).toBeVisible();
  });

  test("the ends are stops, not wraps", async ({ page }) => {
    // Wrapping would contradict the metaphor: a book has a first page.
    await page.goto(CATALOGUE);
    await expect(
      page.getByRole("button", { name: "Previous tile" }),
    ).toBeDisabled();

    await page.keyboard.press("End");
    await expect(page.getByRole("button", { name: "Next tile" })).toBeDisabled();
  });

  test("Escape leaves for the collection page", async ({ page }) => {
    await page.goto(CATALOGUE);
    await page.keyboard.press("Escape");

    await page.waitForURL(new RegExp(`/collections/${COLLECTION}$`), {
      timeout: 30_000,
    });
  });

  test("each page links through to the real product page", async ({ page }) => {
    await page.goto(CATALOGUE);
    await page.getByRole("link", { name: "Full details" }).click();

    await page.waitForURL(/\/en\/products\/[^/]+$/, { timeout: 30_000 });
    await expect(
      page.getByRole("heading", { name: "Specifications" }),
    ).toBeVisible();
  });

  /**
   * A chrome-less duplicate of the catalogue must not compete in search with
   * the product pages it duplicates.
   */
  test("is not indexable, and points its canonical at the collection", async ({
    page,
  }) => {
    await page.goto(CATALOGUE);

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`/collections/${COLLECTION}$`),
    );
  });
});

test.describe("catalogue view in Arabic", () => {
  test("mirrors, and the arrow keys mirror with it", async ({ page }) => {
    await page.goto(`/ar/collections/${COLLECTION}/catalogue`);

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByText(/^1 \/ \d+$/)).toBeVisible();

    // In RTL the page turns the way the language reads: ArrowLeft advances.
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByText(/^2 \/ \d+$/)).toBeVisible();

    await page.keyboard.press("ArrowRight");
    await expect(page.getByText(/^1 \/ \d+$/)).toBeVisible();
  });
});

/** The close control is a link (it navigates); the turn controls are buttons. */
function control_role(label: string): "button" | "link" {
  return label === "Close catalogue" ? "link" : "button";
}
