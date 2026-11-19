// Public parade flyers and share rows. Offline fixtures only.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const SANTA_ID = "6918ff19-f232-4ddf-83d7-82f0a141eb95";
const SANTA_URL = "https://www.kreweofshamrock.com/events/" + SANTA_ID;
const FLYER = "https://www.kreweofshamrock.com/assets/flyers/santafest-2026.jpg";
const STORAGE_FLYER = "https://oazwkwflgbthojvnclfc.supabase.co/storage/v1/object/public/event-flyers/1794544500325-sand-save-1794544458706.png";
const RENDER = "/storage/v1/render/image/public/event-flyers/1794544500325-sand-save-1794544458706.png?width=800&height=1600&resize=contain&quality=60&format=webp";
const OG_IMAGE = "https://oazwkwflgbthojvnclfc.supabase.co/storage/v1/render/image/public/event-flyers/1794544500325-sand-save-1794544458706.png?width=1200&height=2400&resize=contain&quality=75&format=webp";
const WIDTHS = [344, 360, 390, 412, 673, 884];
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

function santaParade(extra) {
  return Object.assign({
    id: SANTA_ID,
    name: "SantaFest",
    description: "Tampa's downtown holiday kickoff parade and the start of the krewe's marching season.",
    event_type: "parade",
    start_time: "2026-12-05T18:00:00.000Z",
    end_time: "2026-12-05T22:00:00.000Z",
    location: "Starts at Morgan St. and Madison St., Downtown Tampa, FL",
    source: "krewe",
    status: "published",
    is_public: true,
    members_only: false,
    external_url: "https://www.friendsoftamparec.org/santa-fest--tree-lighting.html",
    flyer_url: FLYER
  }, extra || {});
}

async function stubParadeList(page, rows) {
  await page.route("**/assets/flyers/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: PNG });
  });
  await page.route("**/storage/v1/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: PNG });
  });
  await page.route("**/rest/v1/v_public_events*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(rows)
    });
  });
  await page.route("**/rest/v1/events*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
}

function santaCard(page) {
  return page.locator("#paradeStaticGrid .parade-card", {
    has: page.getByRole("heading", { level: 3, name: "SantaFest" })
  });
}

async function expectNoHorizontalOverflow(page) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(extra).toBeLessThanOrEqual(1);
}

async function expectPublicShare(card, id) {
  const bar = card.locator(".kos-share");
  await bar.scrollIntoViewIfNeeded();
  await expect(bar).toBeVisible();
  await expect(bar.locator("a.kos-share-group")).toHaveCount(0);
  await expect(bar.locator(".kos-share-note")).toHaveCount(0);
  await expect(bar).not.toContainText("Share in our Krewe group");
  const markup = await bar.evaluate((el) => el.innerHTML);
  expect(markup).not.toContain("1790675004521855");
  const facebook = bar.locator("a.kos-share-fb");
  await expect(facebook).toHaveText("Share on my Facebook");
  const href = await facebook.getAttribute("href");
  const parsed = new URL(href);
  expect(parsed.origin + parsed.pathname).toBe("https://www.facebook.com/sharer/sharer.php");
  expect(parsed.searchParams.get("u")).toBe("https://www.kreweofshamrock.com/events/" + id);
  const copy = bar.locator("button.kos-share-copy");
  await expect(copy).toHaveText("Copy link");
  const page = card.page();
  const vw = page.viewportSize().width;
  for (const control of [facebook, copy]) {
    const box = await control.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(vw + 1);
  }
}

test.describe("public parade flyers and share", () => {
  test.use({ viewport: { width: 390, height: 900 } });

  test("a published parade shows its flyer and the public share row", async ({ page }) => {
    const report = watchPage(page);
    await stubParadeList(page, [
      santaParade(),
      santaParade({
        id: "parade-no-flyer",
        name: "Bay Parade",
        flyer_url: "",
        description: "No flyer yet.",
        start_time: "2027-04-01T16:00:00.000Z"
      })
    ]);
    await page.goto("/parades.html");
    const card = santaCard(page);
    await expect(card).toBeVisible();
    const flyer = card.locator("img.parade-flyer");
    await expect(flyer).toBeVisible();
    await expect(flyer).toHaveAttribute("alt", /steps off at 1:00 PM/);
    await expect(flyer).toHaveAttribute("src", FLYER);
    await expect(flyer).toHaveAttribute("data-full", FLYER);
    expect(await flyer.getAttribute("src")).not.toContain("/storage/v1/render/");
    const link = card.locator("a.parade-flyer-link");
    await expect(link).toHaveAttribute("href", FLYER);
    await expect(link).toHaveAttribute("target", "_blank");
    await expectPublicShare(card, SANTA_ID);
    await expect(page.locator("#paradeStaticGrid")).not.toContainText("Share in our Krewe group");

    const plain = page.locator("#paradeStaticGrid .parade-card", {
      has: page.getByRole("heading", { level: 3, name: "Bay Parade" })
    });
    await expect(plain.locator("img.parade-flyer")).toHaveCount(0);
    await expectPublicShare(plain, "parade-no-flyer");
    await expectNoHorizontalOverflow(page);
    assertHealthy(expect, report, "public parade flyer and share");
  });

  test("a same-origin flyer is not resized, and a broken Supabase resize falls back", async ({ page }) => {
    const report = watchPage(page);
    await page.route("**/storage/v1/render/image/**", (route) => route.abort());
    await page.route("**/storage/v1/object/public/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "image/png", body: PNG });
    });
    await page.route("**/rest/v1/v_public_events*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          santaParade(),
          santaParade({
            id: "storage-santa",
            name: "Storage Santa",
            flyer_url: STORAGE_FLYER,
            start_time: "2026-12-06T18:00:00.000Z"
          })
        ])
      });
    });
    await page.goto("/parades.html");
    const siteFlyer = santaCard(page).locator("img.parade-flyer");
    await expect(siteFlyer).toHaveAttribute("src", FLYER);
    const storage = page.locator("#paradeStaticGrid .parade-card", {
      has: page.getByRole("heading", { level: 3, name: "Storage Santa" })
    }).locator("img.parade-flyer");
    await expect(storage).toHaveAttribute("src", STORAGE_FLYER);
    await expect(storage).toHaveAttribute("data-full", STORAGE_FLYER);
    expect(await storage.getAttribute("src")).not.toMatch(new RegExp(RENDER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assertHealthy(expect, report, "parade flyer fallback");
  });

  test("a draft parade is not given a public share row", async ({ page }) => {
    const report = watchPage(page);
    await stubParadeList(page, [
      santaParade({
        id: "draft-parade",
        name: "Secret Night Parade",
        status: "draft",
        description: "Officers only."
      })
    ]);
    await page.goto("/parades.html");
    await expect(page.locator("#paradeStaticGrid")).not.toContainText("Secret Night Parade");
    await expect(page.locator("#paradeStaticGrid .kos-share")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Share in our Krewe group");
    assertHealthy(expect, report, "draft parade stays off the public page");
  });
});

for (const width of WIDTHS) {
  test.describe("parade share at " + width + "px", () => {
    test.use({ viewport: { width: width, height: 900 } });

    test("the public parade card stays inside the screen", async ({ page }) => {
      const report = watchPage(page);
      await stubParadeList(page, [santaParade()]);
      await page.goto("/parades.html");
      const card = santaCard(page);
      await expect(card.locator("img.parade-flyer")).toBeVisible();
      await expectPublicShare(card, SANTA_ID);
      await expectNoHorizontalOverflow(page);
      assertHealthy(expect, report, "parade share at " + width);
    });
  });
}

test("the parade share page has Open Graph tags, the flyer, and a link back to Parades", async ({ page, request }) => {
  const report = watchPage(page);
  const res = await request.get("/events/fixture-santafest");
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('property="og:title" content="SantaFest"');
  expect(html).toContain('property="og:image" content="' + OG_IMAGE.replace(/&/g, "&amp;") + '"');
  expect(html).toContain('name="twitter:card" content="summary_large_image"');
  expect(html).toContain('name="twitter:image" content="' + OG_IMAGE.replace(/&/g, "&amp;") + '"');
  expect(html).toContain('class="share-kicker">Parade');
  expect(html).toContain('href="/parades.html">Back to Parades');
  expect(html).toContain("Share on my Facebook");
  expect(html).not.toContain("Share in our Krewe group");
  expect(html).not.toContain("1790675004521855");
  expect(html).not.toContain("123 Hidden Lane");

  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/events/fixture-santafest");
  await expect(page.locator(".share-kicker")).toHaveText("Parade");
  await expect(page.locator("h1")).toHaveText("SantaFest");
  const flyer = page.locator("img.share-flyer");
  await expect(flyer).toBeVisible();
  await expect(flyer).toHaveAttribute("src", OG_IMAGE);
  await expect(page.locator("a[href='" + STORAGE_FLYER + "']")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Parades" })).toHaveAttribute("href", "/parades.html");
  await expect(page.locator("a.kos-share-group")).toHaveCount(0);
  await expect(page.locator("a.kos-share-fb")).toBeVisible();
  const back = await page.getByRole("link", { name: "Back to Parades" }).boundingBox();
  expect(back.height).toBeGreaterThanOrEqual(44);
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(extra).toBeLessThanOrEqual(1);
  assertHealthy(expect, report, "parade share page");
});

test("Member Hub Parade tab keeps the Krewe group share row", async ({ page }) => {
  const report = watchPage(page);
  await page.setViewportSize({ width: 390, height: 900 });
  await unlockMemberHub(page);
  await page.waitForFunction(() => window.kosShare && typeof window.kosShare.html === "function");
  await page.evaluate((parade) => {
    window.__kosHubSetFeed({
      profile: { first_name: "Maeve", last_name: "Kelly", email: "maeve@example.com" },
      parades: [parade],
      events: [],
      paradeReady: { dues_paid: true, waiver_signed: true, meeting_attended: true },
      membershipStatus: "active"
    });
  }, santaParade({
    parade_rsvpd: false,
    parade_checked_in: false,
    eligible: true,
    soft_gate_checkin: false
  }));
  await page.locator('[data-hub-tab="parade"]').click();
  const card = page.locator("[data-hub-panel='parade'] [data-parade-card='" + SANTA_ID + "']");
  await expect(card).toBeVisible();
  const bar = card.locator(".kos-share");
  await expect(bar.locator("a.kos-share-group")).toBeVisible();
  await expect(bar.locator("a.kos-share-group")).toHaveText("Share in our Krewe group");
  await expect(bar.locator("a.kos-share-fb")).toHaveText("Share on my Facebook");
  await expect(bar.locator("button.kos-share-copy")).toHaveText("Copy link");
  const group = await bar.locator("a.kos-share-group").boundingBox();
  expect(group.height).toBeGreaterThanOrEqual(44);
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(extra).toBeLessThanOrEqual(1);
  assertHealthy(expect, report, "hub parade share");
});
