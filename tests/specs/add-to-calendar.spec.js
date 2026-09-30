// "Add to my calendar": Google, Outlook, and .ics choices from the Hub events
// list and event detail. Offline fixtures only. No live database writes.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const BASKET = {
  id: "evt-basket",
  name: "Tartan Ball Basket-Making Happy Hour",
  event_type: "social",
  start_time: "2026-10-03T19:00:00.000Z",
  location: "Odessa, FL",
  member_address: "15918 Secret Muirfield Drive",
  members_only: true,
  status: "published",
  source: "krewe",
  description: "Bring a basket."
};

async function openEvents(page) {
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
  }, BASKET);
  await page.locator('[data-hub-tab="events"]').click();
  await expect(page.locator('#hubMemberEventList [data-app-cal="evt-basket"]')).toBeVisible();
}

test("calendar helper builds Google and Outlook links with the teaser only", async ({ page }) => {
  const report = watchPage(page);
  await page.goto("/event-signup.html");
  await page.waitForFunction(() => window.kosCalendar && typeof window.kosCalendar.links === "function");
  const links = await page.evaluate((ev) => window.kosCalendar.links(ev), BASKET);

  const google = new URL(links.google);
  expect(google.hostname).toBe("calendar.google.com");
  expect(google.searchParams.get("action")).toBe("TEMPLATE");
  expect(google.searchParams.get("text")).toBe(BASKET.name);
  // No end_time given, so the event defaults to two hours.
  expect(google.searchParams.get("dates")).toBe("20261003T190000Z/20261003T210000Z");
  expect(google.searchParams.get("location")).toBe("Odessa, FL");

  const outlook = new URL(links.outlook);
  expect(outlook.hostname).toBe("outlook.live.com");
  expect(outlook.searchParams.get("subject")).toBe(BASKET.name);
  expect(outlook.searchParams.get("startdt")).toBe("2026-10-03T19:00:00.000Z");
  expect(outlook.searchParams.get("enddt")).toBe("2026-10-03T21:00:00.000Z");

  expect(new URL(links.office365).hostname).toBe("outlook.office.com");

  for (const url of Object.values(links)) {
    expect(decodeURIComponent(url)).not.toMatch(/Secret Muirfield/);
  }
  assertHealthy(expect, report, "calendar links teaser only");
});

test("calendar helper uses the full member address only when the Hub asks for it", async ({ page }) => {
  const report = watchPage(page);
  await page.goto("/event-signup.html");
  await page.waitForFunction(() => window.kosCalendar && typeof window.kosCalendar.links === "function");
  const out = await page.evaluate((ev) => {
    const member = Object.assign({}, ev, { include_member_address: true });
    return { links: window.kosCalendar.links(member), ics: window.kosCalendar.buildIcs(member) };
  }, BASKET);

  expect(new URL(out.links.google).searchParams.get("location")).toBe("15918 Secret Muirfield Drive");
  expect(new URL(out.links.outlook).searchParams.get("location")).toBe("15918 Secret Muirfield Drive");
  expect(new URL(out.links.office365).searchParams.get("location")).toBe("15918 Secret Muirfield Drive");
  expect(out.ics).toMatch(/LOCATION:15918 Secret Muirfield Drive/);
  // .ics wraps lines longer than 75 characters; unfold before reading text.
  expect(out.ics.replace(/\r\n /g, "")).toMatch(/for members only/);
  assertHealthy(expect, report, "calendar member address");
});

test.describe("Hub add to my calendar", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Calendar button on an event row opens the chooser, not the detail screen", async ({ page }) => {
    const report = watchPage(page);
    await openEvents(page);
    await page.locator('#hubMemberEventList [data-app-cal="evt-basket"]').click();

    const chooser = page.locator("#kosCalChooser");
    await expect(chooser).toBeVisible();
    await expect(chooser).toContainText("Add to my calendar");
    await expect(chooser.locator(".kos-cal-opt")).toHaveCount(4);
    await expect(page.locator("#appEventDetail")).toHaveCount(0);

    const googleHref = await chooser.locator("a.kos-cal-opt").first().getAttribute("href");
    expect(googleHref).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?/);
    // Signed-in members get the full street address in their own calendar.
    expect(new URL(googleHref).searchParams.get("location")).toBe("15918 Secret Muirfield Drive");
    await expect(chooser).toContainText("full member address");

    const download = page.waitForEvent("download");
    await chooser.locator("[data-kos-cal-ics]").click();
    expect((await download).suggestedFilename()).toBe("tartan-ball-basket-making-happy-hour.ics");
    await expect(chooser).toHaveCount(0);
    assertHealthy(expect, report, "row calendar chooser");
  });

  test("event detail Add to my calendar opens the chooser, and Escape closes it", async ({ page }) => {
    const report = watchPage(page);
    await openEvents(page);
    await page.locator('#hubMemberEventList [data-app-event="evt-basket"] .app-event-copy').click();
    await expect(page.locator("#appEventDetail")).toBeVisible();

    await page.locator("#appCalBtn").click();
    await expect(page.locator("#kosCalChooser")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#kosCalChooser")).toHaveCount(0);
    assertHealthy(expect, report, "detail calendar chooser");
  });
});
