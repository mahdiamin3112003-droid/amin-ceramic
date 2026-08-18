import type { Page } from "@playwright/test";

import { expect, test } from "./support/test";

/**
 * The Tile Finder — `/tile-finder`, docs/02-ux-blueprint.md §3.4.
 *
 * ── Why the API is intercepted rather than called ──
 * A real search costs two Gemini calls and a Replicate embedding, takes
 * between nine seconds and four minutes depending on whether the model is
 * warm, and draws on a free-tier quota of twenty requests per DAY. A suite
 * that spent that would be slow, flaky, and would exhaust the quota the
 * feature itself needs.
 *
 * What these specs own is the UI CONTRACT: given each shape the API can
 * return, does the right state render. The pipeline behind it is verified
 * separately against live providers, and the pure logic — calibration,
 * fusion, the grounded explanation — is unit tested.
 *
 * The one thing intercepting cannot prove is that the real API returns these
 * shapes. `matchFinderSession`'s return type is what keeps the two honest:
 * changing it fails the build, not this file.
 */

const START = "**/api/ai/tile-finder";
const MATCH = "**/api/ai/tile-finder/*/match*";

/** A 1x1 PNG — the smallest thing that satisfies `accept="image/*"`. */
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function upload(page: Page): Promise<void> {
  await page.setInputFiles('input[type="file"]', {
    name: "tile.png",
    mimeType: "image/png",
    buffer: PIXEL_PNG,
  });
}

function acceptedStart(sessionId = "01a005cf-cf98-70ea-9d73-eb5e9bdf5754") {
  return {
    data: {
      sessionId,
      attributes: {
        colorFamily: "beige",
        surfaceLook: "stone",
        finish: "matte",
        formatGuess: null,
      },
      imageUrl: "https://example.invalid/query.webp",
      accepted: true,
    },
  };
}

test.describe("tile finder", () => {
  test("STATE 1 — offers an upload and states the REAL catalogue size", async ({
    page,
  }) => {
    await page.goto("/en/tile-finder");

    await expect(
      page.getByRole("heading", { name: /find the tile from a photo/i }),
    ).toBeVisible();

    // §3.4's wireframe says "1,284 products", a number invented at design
    // time. Whatever renders must be the live count, so the assertion is
    // that the placeholder is ABSENT rather than that some number is present.
    await expect(page.getByText("1,284")).toHaveCount(0);
    await expect(page.getByText(/match it against \d+ products/i)).toBeVisible();

    await expect(page.locator('input[type="file"]')).toBeAttached();
  });

  test("STATE 2 — shows real stages, not a spinner", async ({ page }) => {
    // Held open so the analysing state can be observed rather than raced past.
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    await page.route(START, async (route) => {
      await route.fulfill({ json: acceptedStart() });
    });
    await page.route(MATCH, async (route) => {
      await held;
      await route.fulfill({
        json: {
          data: {
            sessionId: "x",
            matches: [],
            products: [],
            isConfident: false,
            visualDegraded: false,
          },
        },
      });
    });

    await page.goto("/en/tile-finder");
    await upload(page);

    // The second stage reports what the model actually saw — the proof that
    // these ticks track real work rather than a timer.
    await expect(page.getByText(/detected:/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/beige/)).toBeVisible();

    release?.();
  });

  test("STATE 3 — ranks results, best first, with grounded explanations", async ({
    page,
  }) => {
    await page.route(START, async (route) => {
      await route.fulfill({ json: acceptedStart() });
    });
    await page.route(MATCH, async (route) => {
      await route.fulfill({
        json: {
          data: {
            sessionId: "x",
            isConfident: true,
            visualDegraded: false,
            matches: [
              {
                productId: "p1",
                percent: 98,
                band: "strong",
                explanation: "Same stone look and matte finish.",
              },
              {
                productId: "p2",
                percent: 41,
                band: "moderate",
                explanation: "Same matte finish; differs in colour.",
              },
            ],
            products: [
              {
                id: "p1",
                slug: "antid-delft-bone-matte",
                name: "Antid. Delft Bone Matte",
                sku: "AC-ANTDELBONMAT-1010",
                nominalFormat: "100×100",
                widthMm: 1000,
                heightMm: 1000,
                finish: { key: "matte", label: "Matte" },
                colorHex: "#e8e2d9",
                primaryImageUrl: "https://example.invalid/a.webp",
              },
              {
                id: "p2",
                slug: "crotone-pearl-matte",
                name: "Crotone Pearl Matte",
                sku: "AC-CROPEAMAT-0612",
                nominalFormat: "60×120",
                widthMm: 600,
                heightMm: 1200,
                finish: { key: "matte", label: "Matte" },
                colorHex: "#ded8d0",
                primaryImageUrl: "https://example.invalid/b.webp",
              },
            ],
          },
        },
      });
    });

    await page.goto("/en/tile-finder");
    await upload(page);

    const rows = page.locator("main ul li");
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });

    // Best match FIRST. The ranking once came back in RRF order while the
    // card showed the calibrated score, putting a 98% match in fourth place.
    await expect(rows.first()).toContainText("Antid. Delft Bone Matte");
    await expect(rows.first()).toContainText("98%");

    // The explanation is a real field comparison, never model prose.
    await expect(rows.first()).toContainText(/same stone look and matte finish/i);

    // Every product is price-on-request, so no figure may appear.
    await expect(page.getByText(/price on request/i).first()).toBeVisible();
    await expect(page.getByText(/\$\d/)).toHaveCount(0);
  });

  test("STATE 4 — declines honestly when nothing is close enough", async ({
    page,
  }) => {
    await page.route(START, async (route) => {
      await route.fulfill({ json: acceptedStart() });
    });
    await page.route(MATCH, async (route) => {
      await route.fulfill({
        json: {
          data: {
            sessionId: "x",
            isConfident: false,
            visualDegraded: false,
            matches: [
              { productId: "p1", percent: 4, band: "none", explanation: "" },
            ],
            products: [],
          },
        },
      });
    });

    await page.goto("/en/tile-finder");
    await upload(page);

    await expect(
      page.getByRole("heading", { name: /no strong match/i }),
    ).toBeVisible({ timeout: 20_000 });

    // A destination, not a dead end: §3.4 designs this state with exits.
    await expect(
      page.getByRole("button", { name: /try another photo/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /browse the catalogue/i }),
    ).toBeVisible();

    // It must not present the weak result as a match anyway.
    await expect(page.locator("main ul li")).toHaveCount(0);
  });

  test("a gate rejection is a designed outcome, not an error", async ({ page }) => {
    await page.route(START, async (route) => {
      await route.fulfill({
        json: {
          data: {
            sessionId: "01a005cf-cf98-70ea-9d73-eb5e9bdf5754",
            gate: "not_a_tile",
            imageUrl: "https://example.invalid/q.webp",
            accepted: false,
          },
        },
      });
    });

    await page.goto("/en/tile-finder");
    await upload(page);

    await expect(
      page.getByRole("button", { name: /try another photo/i }),
    ).toBeVisible({
      timeout: 20_000,
    });
    // Never a raw i18n key, which is what a widened gate enum would leak.
    await expect(page.getByText(/^gate\./)).toHaveCount(0);
  });

  test("a semantic-only ranking says so rather than implying a visual match", async ({
    page,
  }) => {
    await page.route(START, async (route) => {
      await route.fulfill({ json: acceptedStart() });
    });
    await page.route(MATCH, async (route) => {
      await route.fulfill({
        json: {
          data: {
            sessionId: "x",
            isConfident: true,
            visualDegraded: true,
            matches: [
              {
                productId: "p1",
                percent: 55,
                band: "moderate",
                explanation: "Same matte finish.",
              },
            ],
            products: [
              {
                id: "p1",
                slug: "anhor-bone",
                name: "Anhor Bone",
                sku: "AC-ANHBON-0612",
                nominalFormat: "60×120",
                widthMm: 600,
                heightMm: 1200,
                finish: { key: "matte", label: "Matte" },
                colorHex: "#e8e2d9",
                primaryImageUrl: null,
              },
            ],
          },
        },
      });
    });

    await page.goto("/en/tile-finder");
    await upload(page);

    await expect(page.getByText(/visual comparison/i)).toBeVisible({
      timeout: 20_000,
    });
  });

  test("an API failure is reported, never left hanging", async ({ page }) => {
    await page.route(START, async (route) => {
      await route.fulfill({
        status: 503,
        json: { error: { message: "the finder is unavailable right now" } },
      });
    });

    await page.goto("/en/tile-finder");
    await upload(page);

    // Scoped to main: Next renders its own route announcer as
    // <div role="alert" id="__next-route-announcer__"> outside it, so an
    // unscoped role query matches two elements and trips strict mode.
    const alert = page.locator("main").getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 20_000 });
    await expect(alert).toContainText(/unavailable/i);
    // Back to a usable state, not stuck mid-analysis.
    await expect(page.locator('input[type="file"]')).toBeAttached();
  });

  test("mirrors in Arabic", async ({ page }) => {
    await page.goto("/ar/tile-finder");

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator('input[type="file"]')).toBeAttached();
  });
});
