// Share buttons and the per-event page. Offline fixtures only.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const SANTA_ID = "6918ff19-f232-4ddf-83d7-82f0a141eb95";
const SANTA_URL = "https://www.kreweofshamrock.com/events/" + SANTA_ID;
const FLYER = "https://oazwkwflgbthojvnclfc.supabase.co/storage/v1/object/public/event-flyers/1794544500325-sand-save-1794544458706.png";

function santaRow(extra) {
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
    is_featured: true,
    members_only: false,
    flyer_url: FLYER
  }, extra || {});
}

async function stubPublicEvents(page, rows) {
  await page.route("**/storage/v1/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64")
    });
  });
  await page.route("**/rest/v1/v_raffle_events_public*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/rest/v1/rpc/volunteer_slot_summary*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/rest/v1/v_public_events*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(rows)
    });
  });
}

function shareBar(locator) {
  return locator.locator(".kos-share").first();
}

async function expectShareBar(bar, id) {
  const facebook = bar.locator("a.kos-share-fb");
  const page = bar.page();
  const vw = page.viewportSize().width;
  await expect(facebook).toBeVisible();
  // The Hub event screen slides in from the right. Measure it after it lands.
  await expect.poll(async () => {
    const box = await facebook.boundingBox();
    if (!box) return false;
    return box.x >= -1 && box.x + box.width <= vw + 1;
  }).toBe(true);
  await expect(facebook).toHaveText("Share on Facebook");
  const href = await facebook.getAttribute("href");
  const parsed = new URL(href);
  expect(parsed.origin + parsed.pathname).toBe("https://www.facebook.com/sharer/sharer.php");
  expect(parsed.searchParams.get("u")).toBe("https://www.kreweofshamrock.com/events/" + id);
  await expect(facebook).toHaveAttribute("target", "_blank");
  const copy = bar.locator("button.kos-share-copy");
  await expect(copy).toBeVisible();
  await expect(copy).toHaveText("Copy link");
  const box = await facebook.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  const copyBox = await copy.boundingBox();
  expect(copyBox.height).toBeGreaterThanOrEqual(44);
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(vw + 1);
  expect(copyBox.x).toBeGreaterThanOrEqual(-1);
  expect(copyBox.x + copyBox.width).toBeLessThanOrEqual(vw + 1);
}

async function expectNoHorizontalOverflow(page) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(extra).toBeLessThanOrEqual(1);
}

test.describe("public event share buttons", () => {
  test.use({
    viewport: { width: 360, height: 800 },
    permissions: ["clipboard-read", "clipboard-write"]
  });

  test("events page shows Facebook and copy on the featured card and preview cards", async ({ page }) => {
    const report = watchPage(page);
    const started = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    await stubPublicEvents(page, [
      santaRow(),
      santaRow({
        id: "started-social",
        name: "Morning Coffee",
        event_type: "social",
        is_featured: false,
        start_time: started,
        end_time: started,
        location: "Ybor",
        description: "Coffee after the meeting."
      })
    ]);
    await page.goto("/event-signup.html");
    await expect(page.locator("#featured-event")).toContainText("SantaFest");
    const featured = shareBar(page.locator("#featured-event"));
    await featured.scrollIntoViewIfNeeded();
    await expectShareBar(featured, SANTA_ID);
    await expect(page.locator("#featured-event")).toContainText("Parade details");

    const card = page.locator("#eventPreviewStrip .ev-card", { hasText: "Morning Coffee" });
    await expect(card).toContainText("Registration closed");
    await expectShareBar(shareBar(card), "started-social");
    await expectNoHorizontalOverflow(page);

    await featured.locator(".kos-share-copy").click();
    await expect(featured.locator(".kos-share-copy")).toHaveText("Link copied");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(SANTA_URL);
    assertHealthy(expect, report, "events page share buttons");
  });

  test("home featured card can be shared", async ({ page }) => {
    const report = watchPage(page);
    await stubPublicEvents(page, [santaRow()]);
    await page.goto("/index.html");
    const featured = shareBar(page.locator("#featuredEventCard"));
    await expect(page.locator("#featuredEventCard")).toContainText("SantaFest");
    await featured.scrollIntoViewIfNeeded();
    await expectShareBar(featured, SANTA_ID);
    await expectNoHorizontalOverflow(page);
    assertHealthy(expect, report, "home featured share");
  });

  test("the phone share button uses the event link when the browser can share", async ({ page }) => {
    const report = watchPage(page);
    await page.addInitScript(() => {
      window.__shared = null;
      navigator.share = function (data) {
        window.__shared = data;
        return Promise.resolve();
      };
    });
    await stubPublicEvents(page, [santaRow()]);
    await page.goto("/event-signup.html");
    const native = page.locator("#featured-event .kos-share-native");
    await native.scrollIntoViewIfNeeded();
    await expect(native).toBeVisible();
    const box = await native.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    await native.click();
    const shared = await page.evaluate(() => window.__shared);
    expect(shared.url).toBe(SANTA_URL);
    expect(shared.title).toBe("SantaFest");
    await expect(page.locator("#featured-event")).toBeVisible();
    assertHealthy(expect, report, "native share");
  });
});

test.describe("hub event share buttons", () => {
  test.use({
    viewport: { width: 360, height: 800 },
    permissions: ["clipboard-read", "clipboard-write"]
  });

  test("Events list and the event screen can share, and copy does not open the screen", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page);
    await page.waitForSelector("#appTop");
    await page.evaluate((ev) => {
      window.__kosHubSetFeed({
        profile: { first_name: "Maeve", last_name: "Kelly", email: "maeve@example.com" },
        parades: [],
        events: [ev],
        paradeReady: { dues_paid: true, waiver_signed: true, meeting_attended: true },
        membershipStatus: "active"
      });
      if (typeof window.__kosHubSyncRoute === "function") window.__kosHubSyncRoute();
    }, santaRow());

    await expect(page.locator("#appNextUp")).toContainText("SantaFest");
    await expectShareBar(shareBar(page.locator("#appNextUp")), SANTA_ID);

    await page.locator('[data-hub-tab="events"]').click();
    const card = page.locator("#hubMemberEventList .hub-ev-card");
    await expect(card).toContainText("SantaFest");
    const bar = shareBar(card);
    await expectShareBar(bar, SANTA_ID);
    await expectNoHorizontalOverflow(page);

    await bar.locator(".kos-share-copy").click();
    await expect(bar.locator(".kos-share-copy")).toHaveText("Link copied");
    await expect(page.locator("#appEventDetail")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(SANTA_URL);

    await card.locator(".app-event-copy").click();
    const detail = page.locator("#appEventDetail");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("SantaFest");
    await expectShareBar(shareBar(detail), SANTA_ID);
    await expectNoHorizontalOverflow(page);
    assertHealthy(expect, report, "hub share buttons");
  });
});

test.describe("share buttons at a Fold width", () => {
  test.use({ viewport: { width: 344, height: 800 } });

  test("events page, home card, and Hub stay inside 344px", async ({ page }) => {
    const report = watchPage(page);
    await stubPublicEvents(page, [santaRow()]);
    await page.goto("/event-signup.html");
    await expectShareBar(shareBar(page.locator("#featured-event")), SANTA_ID);
    await expectNoHorizontalOverflow(page);

    await page.goto("/index.html");
    await expectShareBar(shareBar(page.locator("#featuredEventCard")), SANTA_ID);
    await expectNoHorizontalOverflow(page);

    await unlockMemberHub(page);
    await page.waitForSelector("#appTop");
    await page.evaluate((ev) => {
      window.__kosHubSetFeed({
        profile: { first_name: "Maeve", last_name: "Kelly", email: "maeve@example.com" },
        events: [ev]
      });
    }, santaRow());
    await page.locator('[data-hub-tab="events"]').click();
    await expectShareBar(shareBar(page.locator("#hubMemberEventList")), SANTA_ID);
    await expectNoHorizontalOverflow(page);
    assertHealthy(expect, report, "share buttons at 344");
  });
});

test("per-event URL returns SantaFest Open Graph tags and hides unpublished events", async ({ request }) => {
  const ok = await request.get("/events/fixture-santafest");
  expect(ok.status()).toBe(200);
  const html = await ok.text();
  expect(html).toContain('property="og:title" content="SantaFest"');
  expect(html).toContain('property="og:description" content="Saturday, December 5, 2026, 1:00 PM Eastern. Starts at Morgan St. and Madison St., Downtown Tampa, FL. Tampa\'s downtown holiday kickoff parade and the start of the krewe\'s marching season. The parade steps off at 1:00 PM at Morgan Street and Madison Street."');
  expect(html).toContain('property="og:image" content="https://oazwkwflgbthojvnclfc.supabase.co/storage/v1/render/image/public/event-flyers/1794544500325-sand-save-1794544458706.png?width=1200&amp;height=2400&amp;resize=contain&amp;quality=75&amp;format=webp"');
  expect(html).toContain('property="og:url" content="https://www.kreweofshamrock.com/events/fixture-santafest"');
  expect(html).toContain('property="og:type" content="website"');
  expect(html).toContain('property="og:site_name" content="Krewe of Shamrock"');
  expect(html).toContain('name="twitter:card" content="summary_large_image"');
  expect(html).not.toContain("123 Hidden Lane");
  expect(html).not.toContain("Gate code 4321");

  const draft = await request.get("/events/fixture-draft");
  expect(draft.status()).toBe(404);
  const hidden = await draft.text();
  expect(hidden).not.toContain("Secret Draft Gala");
  expect(hidden).not.toContain('property="og:title"');

  const missing = await request.get("/events/not-a-real-event");
  expect(missing.status()).toBe(404);
});
