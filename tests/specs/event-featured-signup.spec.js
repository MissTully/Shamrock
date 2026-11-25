const { test, expect } = require("./kos-fixtures");
const { watchPage, assertHealthy } = require("./helpers");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function eventRow(overrides) {
  return Object.assign({
    id: "22222222-2222-2222-2222-222222222222",
    name: "Shamrock Social",
    description: "A public social.",
    event_type: "social",
    start_time: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    end_time: null,
    location: "Tampa",
    source: "krewe",
    status: "published",
    is_public: true,
    is_featured: false,
    members_only: false,
    flyer_url: "https://oazwkwflgbthojvnclfc.supabase.co/storage/v1/object/public/event-flyers/social.png"
  }, overrides);
}

async function stubExtras(page) {
  await page.route("**/storage/v1/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: PNG });
  });
  await page.route("**/rest/v1/v_raffle_events_public*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/rest/v1/rpc/volunteer_slot_summary*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
}

test("events page keeps a skeleton until featured data arrives, then shows the pinned event", async ({ page }) => {
  const report = watchPage(page);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const santaFlyer = "https://oazwkwflgbthojvnclfc.supabase.co/storage/v1/object/public/event-flyers/santafest.png";
  await stubExtras(page);
  await page.route("**/rest/v1/v_public_events*", async (route) => {
    await gate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        eventRow({
          id: "26a66536-1708-4897-8967-6a7b6d9c2397",
          name: "No More Umbrellas",
          start_time: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          flyer_url: "https://oazwkwflgbthojvnclfc.supabase.co/storage/v1/object/public/event-flyers/umbrellas.jpg"
        }),
        eventRow({
          id: "6918ff19-f232-4ddf-83d7-82f0a141eb95",
          name: "SantaFest",
          event_type: "parade",
          is_featured: true,
          start_time: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
          location: "Downtown Tampa",
          description: "Holiday parade.",
          flyer_url: santaFlyer
        })
      ])
    });
  });

  await page.goto("/event-signup.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#featured-event")).toBeVisible();
  await expect(page.locator("#featured-event .featured-skel").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Event flyers are coming soon");
  await expect(page.locator("body")).not.toContainText("as soon as its flyer is ready");
  const during = await page.evaluate(() => {
    const featured = document.getElementById("featured-event").getBoundingClientRect();
    const previews = document.getElementById("event-previews");
    return { featuredTop: featured.top, previewsHidden: previews.hidden };
  });
  expect(during.featuredTop).toBeGreaterThan(0);
  expect(during.previewsHidden).toBe(true);

  release();
  await expect(page.locator("#featured-event")).toContainText("SantaFest");
  await expect(page.locator("#featured-event")).not.toContainText("No More Umbrellas");
  const img = page.locator("#featured-event img.featured-flyer");
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute("src", /\/render\/image\/public\/event-flyers\/santafest\.png\?width=900&height=1800&resize=contain&quality=60&format=webp/);
  await expect(img).toHaveAttribute("data-full", santaFlyer);
  await expect(page.locator("#featured-event a.kos-quiet-rsvp")).toHaveAttribute("href", "/event-signup.html?event=6918ff19-f232-4ddf-83d7-82f0a141eb95#rsvpForm");
  await expect(page.locator("#featured-event")).not.toContainText("Sign in to RSVP");
  const order = await page.evaluate(() => {
    const featured = document.getElementById("featured-event").getBoundingClientRect().top;
    const previews = document.getElementById("event-previews").getBoundingClientRect().top;
    return { featured, previews, previewsHidden: document.getElementById("event-previews").hidden };
  });
  expect(order.previewsHidden).toBe(false);
  expect(order.featured).toBeLessThan(order.previews);
  assertHealthy(expect, report, "events featured skeleton");
});

test("events page hides the featured section when nothing qualifies", async ({ page }) => {
  const report = watchPage(page);
  const past = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  await stubExtras(page);
  await page.route("**/rest/v1/v_public_events*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        eventRow({
          name: "Past Ceili",
          start_time: past,
          end_time: past,
          is_featured: true,
          flyer_url: "https://oazwkwflgbthojvnclfc.supabase.co/storage/v1/object/public/event-flyers/past.png"
        })
      ])
    });
  });
  await page.goto("/event-signup.html");
  await expect(page.locator("#featured-event")).toBeHidden();
  await expect(page.locator("body")).not.toContainText("Event flyers are coming soon");
  await expect(page.locator("body")).not.toContainText("Past Ceili");
  assertHealthy(expect, report, "events featured hidden");
});

test("featured pick prefers a live pinned event, then the next Krewe flyer", async ({ page }) => {
  const report = watchPage(page);
  await page.goto("/event-signup.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.kosCalendar && typeof window.kosCalendar.pickFeaturedEvent === "function");
  const result = await page.evaluate(() => {
    const cal = window.kosCalendar;
    const now = new Date("2026-11-16T15:00:00Z");
    const rows = [
      {
        id: "ikc",
        name: "IKC Party",
        source: "ikc",
        status: "published",
        is_public: true,
        start_time: "2026-11-18T22:00:00Z",
        flyer_url: "https://example.test/ikc.png"
      },
      {
        id: "ended",
        name: "Old Social",
        source: "krewe",
        status: "published",
        is_featured: true,
        start_time: "2026-11-10T22:00:00Z",
        flyer_url: "https://example.test/old.png"
      },
      {
        id: "noflyer",
        name: "Breakfast",
        source: "krewe",
        status: "published",
        event_type: "social",
        start_time: "2026-11-20T14:00:00Z"
      },
      {
        id: "parade",
        name: "SantaFest",
        source: "krewe",
        status: "published",
        is_featured: true,
        event_type: "parade",
        start_time: "2026-12-05T18:00:00Z",
        flyer_url: "https://oazwkwflgbthojvnclfc.supabase.co/storage/v1/object/public/event-flyers/santa.png?x=1"
      },
      {
        id: "next",
        name: "Bag Stuffing",
        source: "krewe",
        status: "published",
        event_type: "social",
        start_time: "2026-11-16T22:00:00Z",
        flyer_url: "https://oazwkwflgbthojvnclfc.supabase.co/storage/v1/object/public/event-flyers/bags.jpg"
      }
    ];
    const withoutPin = rows.map((row) => Object.assign({}, row, { is_featured: row.id === "ended" }));
    return {
      pinned: cal.pickFeaturedEvent(rows, now).name,
      fallback: cal.pickFeaturedEvent(withoutPin, now).name,
      pdf: cal.flyerDisplayUrl("https://cdn.example/flyer.pdf"),
      sized: cal.flyerDisplayUrl(rows[3].flyer_url, 900),
      plain: cal.flyerDisplayUrl("https://cdn.example/photo.jpg", 640)
    };
  });
  expect(result.pinned).toBe("SantaFest");
  expect(result.fallback).toBe("Bag Stuffing");
  expect(result.pdf).toBe("");
  expect(result.sized).toBe("https://oazwkwflgbthojvnclfc.supabase.co/storage/v1/render/image/public/event-flyers/santa.png?width=900&height=1800&resize=contain&quality=60&format=webp");
  expect(result.plain).toBe("https://cdn.example/photo.jpg");
  assertHealthy(expect, report, "featured pick rules");
});
