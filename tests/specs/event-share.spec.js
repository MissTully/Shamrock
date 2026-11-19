// Share buttons and the per-event page. Offline fixtures only.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const SANTA_ID = "6918ff19-f232-4ddf-83d7-82f0a141eb95";
const SANTA_URL = "https://www.kreweofshamrock.com/events/" + SANTA_ID;
const GROUP_URL = "https://www.facebook.com/groups/1790675004521855";
const GROUP_LABEL = "Share in our Krewe group";
const MINE_LABEL = "Share on my Facebook";
const GROUP_NOTE = "Link copied. Paste it into a new post in the group.";
const WIDTHS = [344, 360, 390, 412, 673, 884];
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

function eventLink(id) {
  return "https://www.kreweofshamrock.com/events/" + id;
}

async function expectInside(locator, vw) {
  await expect.poll(async () => {
    const box = await locator.boundingBox();
    if (!box) return false;
    return box.height >= 44 && box.x >= -1 && box.x + box.width <= vw + 1;
  }).toBe(true);
}

async function expectShareBar(bar, id) {
  const group = bar.locator("a.kos-share-group");
  const facebook = bar.locator("a.kos-share-fb");
  const page = bar.page();
  const vw = page.viewportSize().width;
  await bar.scrollIntoViewIfNeeded();
  await expect(bar).toBeVisible();
  await bar.evaluate((el) => el.scrollIntoView({ block: "nearest", inline: "nearest" }));
  await expect(group).toBeVisible();
  await expect(facebook).toBeVisible();
  // The Hub event screen slides in from the right. Measure it after it lands.
  await expectInside(group, vw);
  await expectInside(facebook, vw);
  await expect(group).toHaveText(GROUP_LABEL);
  await expect(group).toHaveAttribute("href", GROUP_URL);
  await expect(group).toHaveAttribute("target", "_blank");
  await expect(facebook).toHaveText(MINE_LABEL);
  const href = await facebook.getAttribute("href");
  const parsed = new URL(href);
  expect(parsed.origin + parsed.pathname).toBe("https://www.facebook.com/sharer/sharer.php");
  expect(parsed.searchParams.get("u")).toBe(eventLink(id));
  await expect(facebook).toHaveAttribute("target", "_blank");
  const copy = bar.locator("button.kos-share-copy");
  await expect(copy).toBeVisible();
  await expect(copy).toHaveText("Copy link");
  await expectInside(copy, vw);
  await expect.poll(async () => {
    const groupBox = await group.boundingBox();
    const facebookBox = await facebook.boundingBox();
    const copyBox = await copy.boundingBox();
    if (!groupBox || !facebookBox || !copyBox) return false;
    return Math.abs(groupBox.y - facebookBox.y) <= 2 &&
      Math.abs(groupBox.width - facebookBox.width) <= 2 &&
      Math.abs(groupBox.height - facebookBox.height) <= 2 &&
      facebookBox.x > groupBox.x + 8 &&
      copyBox.y > groupBox.y + 8;
  }).toBe(true);
  const paint = await bar.evaluate((root) => {
    const groupEl = root.querySelector(".kos-share-group");
    const mineEl = root.querySelector(".kos-share-fb");
    const copyEl = root.querySelector(".kos-share-copy");
    const groupStyle = getComputedStyle(groupEl);
    const mineStyle = getComputedStyle(mineEl);
    const copyStyle = getComputedStyle(copyEl);
    return {
      groupBg: groupStyle.backgroundColor,
      mineBg: mineStyle.backgroundColor,
      copyBg: copyStyle.backgroundColor,
      groupColor: groupStyle.color,
      mineColor: mineStyle.color,
      groupSize: groupStyle.fontSize,
      mineSize: mineStyle.fontSize,
      groupWeight: groupStyle.fontWeight,
      mineWeight: mineStyle.fontWeight
    };
  });
  expect(paint.groupBg).toBe(paint.mineBg);
  expect(paint.groupColor).toBe(paint.mineColor);
  expect(paint.groupSize).toBe(paint.mineSize);
  expect(paint.groupWeight).toBe(paint.mineWeight);
  expect(paint.groupBg).not.toBe(paint.copyBg);
}

async function expectFilledShareRow(bar) {
  const rows = await bar.evaluate((root) => {
    const barBox = root.getBoundingClientRect();
    const items = Array.from(root.querySelectorAll("a, button")).filter((el) => {
      if (el.hidden) return false;
      const style = getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    const grouped = [];
    items.forEach((el) => {
      const box = el.getBoundingClientRect();
      let row = grouped.find((entry) => Math.abs(entry.top - box.top) <= 3);
      if (!row) {
        row = { top: box.top, left: box.left, right: box.right, height: box.height };
        grouped.push(row);
      } else {
        row.left = Math.min(row.left, box.left);
        row.right = Math.max(row.right, box.right);
        row.height = Math.max(row.height, box.height);
      }
    });
    return grouped.map((row) => ({
      missingLeft: row.left - barBox.left,
      missingRight: barBox.right - row.right,
      height: row.height,
      count: items.length
    }));
  });
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.height).toBeGreaterThanOrEqual(44);
    expect(row.missingLeft).toBeLessThanOrEqual(2);
    expect(row.missingRight).toBeLessThanOrEqual(2);
  }
}

async function expectPublicShareBar(bar, id) {
  const facebook = bar.locator("a.kos-share-fb");
  const page = bar.page();
  const vw = page.viewportSize().width;
  await bar.scrollIntoViewIfNeeded();
  await expect(bar).toBeVisible();
  await bar.evaluate((el) => el.scrollIntoView({ block: "nearest", inline: "nearest" }));
  await expect(bar.locator("a.kos-share-group")).toHaveCount(0);
  await expect(bar.locator(".kos-share-note")).toHaveCount(0);
  await expect(bar.locator(".kos-share-fallback")).toHaveCount(0);
  await expect(bar).not.toContainText(GROUP_LABEL);
  const markup = await bar.evaluate((el) => el.innerHTML);
  expect(markup).not.toContain("1790675004521855");
  expect(markup).not.toContain("kos-share-group");
  expect(markup).not.toContain("Paste it into a new post");
  await expect(facebook).toBeVisible();
  await expectInside(facebook, vw);
  await expect(facebook).toHaveText(MINE_LABEL);
  const href = await facebook.getAttribute("href");
  const parsed = new URL(href);
  expect(parsed.origin + parsed.pathname).toBe("https://www.facebook.com/sharer/sharer.php");
  expect(parsed.searchParams.get("u")).toBe(eventLink(id));
  await expect(facebook).toHaveAttribute("target", "_blank");
  const copy = bar.locator("button.kos-share-copy");
  await expect(copy).toBeVisible();
  await expect(copy).toHaveText("Copy link");
  await expectInside(copy, vw);
  const native = bar.locator("button.kos-share-native");
  if (await native.isVisible()) await expectInside(native, vw);
  await expectFilledShareRow(bar);
}

async function silenceFacebook(page) {
  const blank = route => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!DOCTYPE html><title>Facebook</title><p>Facebook</p>"
  });
  await page.context().route("https://www.facebook.com/**", blank);
  await page.context().route("https://m.facebook.com/**", blank);
}

async function clickGroup(bar) {
  const page = bar.page();
  const popupPromise = page.waitForEvent("popup");
  await bar.locator("a.kos-share-group").click();
  const popup = await popupPromise;
  await popup.close().catch(() => {});
  await page.bringToFront();
}

async function quietHubNetwork(page) {
  await page.route("**://*.supabase.co/**", async (route) => {
    const type = route.request().resourceType();
    if (type === "image") {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64")
      });
      return;
    }
    const url = route.request().url();
    const body = url.includes("/auth/") ? "{}" : "[]";
    await route.fulfill({ status: 200, contentType: "application/json", body: body });
  });
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
    await expectPublicShareBar(featured, SANTA_ID);
    await expect(page.locator("#featured-event")).toContainText("Parade details");

    const card = page.locator("#eventPreviewStrip .ev-card", { hasText: "Morning Coffee" });
    await expect(card).toContainText("Registration closed");
    await expectPublicShareBar(shareBar(card), "started-social");
    await expectNoHorizontalOverflow(page);

    await featured.locator(".kos-share-copy").click();
    await expect(featured.locator(".kos-share-copy")).toHaveText("Link copied");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(SANTA_URL);
    assertHealthy(expect, report, "events page share buttons");
  });

  test("the public event page keeps a personal Facebook share and leaves out the Krewe group", async ({ page }) => {
    const report = watchPage(page);
    await page.goto("/events/fixture-santafest");
    const bar = shareBar(page.locator("main"));
    await bar.scrollIntoViewIfNeeded();
    await expectPublicShareBar(bar, "fixture-santafest");
    await expectNoHorizontalOverflow(page);
    const html = await page.content();
    expect(html).not.toContain(GROUP_URL);
    expect(html).not.toContain(GROUP_LABEL);
    expect(html).not.toContain("kos-share-fallback");
    await bar.locator(".kos-share-copy").click();
    await expect(bar.locator(".kos-share-copy")).toHaveText("Link copied");
    await expect(page).toHaveURL(/\/events\/fixture-santafest/);
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(eventLink("fixture-santafest"));
    await expectNoHorizontalOverflow(page);
    assertHealthy(expect, report, "public event share without the group");
  });

  test("home featured card can be shared", async ({ page }) => {
    const report = watchPage(page);
    await stubPublicEvents(page, [santaRow()]);
    await page.goto("/index.html");
    const featured = shareBar(page.locator("#featuredEventCard"));
    await expect(page.locator("#featuredEventCard")).toContainText("SantaFest");
    await featured.scrollIntoViewIfNeeded();
    await expectPublicShareBar(featured, SANTA_ID);
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
    await expectPublicShareBar(shareBar(page.locator("#featured-event")), SANTA_ID);
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
    await quietHubNetwork(page);
    await unlockMemberHub(page);
    await page.waitForLoadState("networkidle").catch(() => {});
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
    const nextBar = shareBar(page.locator("#appNextUp"));
    await expectShareBar(nextBar, SANTA_ID);
    await silenceFacebook(page);
    await clickGroup(nextBar);
    await expect(nextBar.locator(".kos-share-note")).toHaveText(GROUP_NOTE);
    await expect(page.locator("#appEventDetail")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(SANTA_URL);

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

    await clickGroup(bar);
    await expect(bar.locator(".kos-share-note")).toHaveText(GROUP_NOTE);
    await expect(page.locator("#appEventDetail")).toHaveCount(0);

    await card.locator(".app-event-copy").click();
    const detail = page.locator("#appEventDetail");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("SantaFest");
    await expectShareBar(shareBar(detail), SANTA_ID);
    await expectNoHorizontalOverflow(page);
    assertHealthy(expect, report, "hub share buttons");
  });

  test("a blocked clipboard on a Hub card shows the event link to copy by hand", async ({ page }) => {
    const report = watchPage(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: function () { return Promise.reject(new Error("blocked")); } }
      });
      document.execCommand = function () { return false; };
    });
    await quietHubNetwork(page);
    await silenceFacebook(page);
    await unlockMemberHub(page);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForSelector("#appTop");
    await page.evaluate((ev) => {
      window.__kosHubSetFeed({
        profile: { first_name: "Maeve", last_name: "Kelly", email: "maeve@example.com" },
        parades: [],
        events: [ev],
        paradeReady: { dues_paid: true, waiver_signed: true, meeting_attended: true },
        membershipStatus: "active"
      });
    }, santaRow());
    await page.locator('[data-hub-tab="events"]').click();
    const card = page.locator("#hubMemberEventList .hub-ev-card");
    await expect(card).toContainText("SantaFest");
    const bar = shareBar(card);
    await bar.scrollIntoViewIfNeeded();
    await clickGroup(bar);
    const field = bar.locator(".kos-share-fallback-url");
    await expect(field).toBeVisible();
    await expect(field).toHaveValue(SANTA_URL);
    const fieldBox = await field.boundingBox();
    expect(fieldBox.height).toBeGreaterThanOrEqual(44);
    await expect(bar.locator(".kos-share-note")).toHaveText("Select this link, then paste it into a new post in the group.");
    await expect(page.locator("#appEventDetail")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    assertHealthy(expect, report, "hub clipboard fallback");
  });
});

for (const width of WIDTHS) {
  test.describe("share buttons at " + width + "px", () => {
    test.use({ viewport: { width: width, height: 800 } });

    test("events page, home card, public event, and Hub stay inside the glass", async ({ page }) => {
      const report = watchPage(page);
      await page.addInitScript(() => {
        if (typeof navigator.share !== "function") {
          navigator.share = function () { return Promise.resolve(); };
        }
      });
      await stubPublicEvents(page, [santaRow()]);
      await page.goto("/event-signup.html");
      const featured = shareBar(page.locator("#featured-event"));
      await expectPublicShareBar(featured, SANTA_ID);
      await expect(featured.locator("button.kos-share-native")).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await page.goto("/events/fixture-santafest");
      const eventBar = shareBar(page.locator("main"));
      await expectPublicShareBar(eventBar, "fixture-santafest");
      await expect(eventBar.locator("button.kos-share-native")).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await page.goto("/index.html");
      const home = shareBar(page.locator("#featuredEventCard"));
      await expectPublicShareBar(home, SANTA_ID);
      await expect(home.locator("button.kos-share-native")).toBeVisible();
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
      assertHealthy(expect, report, "share buttons at " + width);
    });
  });
}

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
  expect(html).not.toContain('href="https://www.facebook.com/groups/1790675004521855"');
  expect(html).not.toContain("Share in our Krewe group");
  expect(html).not.toContain("kos-share-note");
  expect(html).not.toContain("kos-share-fallback");
  expect(html).toContain("Share on my Facebook");
  expect(html).not.toContain(">Share on Facebook<");
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
