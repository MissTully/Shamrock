// In-hub navigation: tab stacks, system back, and one event detail screen.
// Offline fixtures only. This does not write to the live database.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const PARADE = {
  id: "parade-gasparilla",
  name: "Gasparilla Parade of Pirates",
  event_type: "parade",
  start_time: "2027-01-30T19:00:00.000Z",
  location: "Bayshore Boulevard, Tampa",
  members_only: true
};

const NEXT = {
  id: "evt-basket",
  name: "Tartan Ball Basket Social",
  event_type: "social",
  start_time: "2026-10-03T17:00:00.000Z",
  location: "Higgins Hall",
  members_only: true,
  status: "published",
  source: "krewe",
  description: "Bring a basket and a friend."
};

const LATER = {
  id: "evt-later",
  name: "Float Build Saturday",
  event_type: "social",
  start_time: "2026-10-04T13:00:00.000Z",
  location: "The Unicorn Den",
  members_only: true,
  status: "published",
  source: "krewe"
};

async function openApp(page) {
  await unlockMemberHub(page);
  await page.waitForSelector("#appTop");
  await page.waitForSelector("#appDash");
  await page.evaluate(({ parade, next, later }) => {
    window.__kosHubSetFeed({
      profile: { first_name: "Maeve", last_name: "Kelly", email: "maeve@example.com", parade_since: "2014" },
      parades: [parade],
      events: [next, later],
      paradeReady: { dues_paid: true, waiver_signed: true, meeting_attended: true },
      membershipStatus: "active"
    });
    if (typeof window.__kosHubSyncRoute === "function") window.__kosHubSyncRoute();
  }, { parade: PARADE, next: NEXT, later: LATER });
}

async function eventDetail(page) {
  const detail = page.locator("#appEventDetail");
  await expect(detail).toBeVisible();
  await expect(page.locator("#appBack")).toBeVisible();
  await expect(page.locator("#appBack")).toContainText("Back");
  await expect(page.locator("#appRsvpBtn")).toBeVisible();
  await expect(page.locator("#appCalBtn")).toBeVisible();
  await expect(page.locator("#hubTabs")).toBeVisible();
  return detail;
}

test.describe("Member Hub app navigation", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("back from Events returns Home and does not sign out", async ({ page }) => {
    const report = watchPage(page);
    await openApp(page);
    await page.evaluate(() => {
      window.__signedOut = false;
      window.kosSignOut = function () { window.__signedOut = true; };
    });

    await page.locator('[data-hub-tab="events"]').click();
    await expect(page.locator("[data-hub-panel='events']")).toHaveClass(/hub-on/);
    await expect(page.locator("#appPageTitle")).toHaveText("Events");
    await expect(page.locator("#hubTabs")).toBeVisible();

    await page.goBack();
    await expect(page.locator("[data-hub-panel='hub']")).toHaveClass(/hub-on/);
    await expect(page.locator("#appPageTitle")).toHaveText("Home");
    await expect(page.locator("#appDrill")).toBeHidden();
    await expect(page.locator("body")).toHaveClass(/hub-app/);
    expect(await page.evaluate(() => window.__signedOut)).toBe(false);
    await expect(page).toHaveURL(/members\.html/);
    assertHealthy(expect, report, "back from events");
  });

  test("tab switch restores the event stack, and tapping the active tab returns to the top", async ({ page }) => {
    const report = watchPage(page);
    await openApp(page);

    await page.locator('[data-hub-tab="events"]').click();
    await page.evaluate(() => {
      const panel = document.querySelector('[data-hub-panel="events"]');
      const spacer = document.createElement("div");
      spacer.id = "scrollSpacer";
      spacer.style.height = "1800px";
      panel.appendChild(spacer);
      panel.scrollTop = 520;
    });
    await page.locator('#hubMemberEventList [data-app-event="evt-basket"] .app-event-copy').click();
    await eventDetail(page);
    await expect(page.locator("#appBackTitle")).toContainText("Tartan Ball Basket Social");

    await page.locator('[data-hub-tab="krewe"]').click();
    await expect(page.locator("#appPageTitle")).toHaveText("Me");
    await expect(page.locator("#appDrill")).toBeHidden();
    await expect(page.locator("#hubMemberDirectory")).toBeVisible();

    await page.locator('[data-hub-tab="events"]').click();
    await eventDetail(page);
    await expect(page.locator('#hubTabs [data-hub-tab="events"]')).toHaveAttribute("aria-current", "page");

    await page.locator('[data-hub-tab="events"]').click();
    await expect(page.locator("#appDrill")).toBeHidden();
    await expect(page.locator("#hubMemberEventList")).toBeVisible();
    await expect(page.locator("#appPageTitle")).toHaveText("Events");
    const top = await page.evaluate(() => document.querySelector('[data-hub-panel="events"]').scrollTop);
    expect(top).toBeLessThan(40);

    await page.evaluate(() => {
      const panel = document.querySelector('[data-hub-panel="events"]');
      panel.scrollTop = 480;
    });
    await page.locator('[data-hub-tab="hub"]').click();
    await expect(page.locator("#appPageTitle")).toHaveText("Home");
    await page.locator('[data-hub-tab="events"]').click();
    await expect(page.locator("#appPageTitle")).toHaveText("Events");
    const restored = await page.evaluate(() => document.querySelector('[data-hub-panel="events"]').scrollTop);
    expect(restored).toBeGreaterThan(400);
    assertHealthy(expect, report, "tab stack restore");
  });

  test("Home next up and the Events list open the same detail, and back returns to each", async ({ page }) => {
    const report = watchPage(page);
    await openApp(page);

    await page.locator("#appNextUp .app-rsvp").click();
    let detail = await eventDetail(page);
    await expect(detail).toContainText("Tartan Ball Basket Social");
    await expect(detail).toContainText("Higgins Hall");
    await expect(detail).toContainText("Bring a basket and a friend.");
    await expect(page.locator('#hubTabs [data-hub-tab="hub"]')).toHaveAttribute("aria-current", "page");
    const rsvpBox = await page.locator("#appRsvpBtn").boundingBox();
    const calBox = await page.locator("#appCalBtn").boundingBox();
    expect(rsvpBox.height).toBeGreaterThanOrEqual(44);
    expect(calBox.height).toBeGreaterThanOrEqual(44);
    const backBox = await page.locator("#appBack").boundingBox();
    expect(backBox.height).toBeGreaterThanOrEqual(44);

    await page.locator("#appBack").click();
    await expect(page.locator("#appDrill")).toBeHidden();
    await expect(page.locator("#appPageTitle")).toHaveText("Home");
    await expect(page.locator(".app-hero h2")).toBeVisible();

    await page.locator('[data-hub-tab="events"]').click();
    await page.locator('#hubMemberEventList [data-app-event="evt-later"] .app-event-copy').click();
    detail = await eventDetail(page);
    await expect(detail).toContainText("Float Build Saturday");
    await expect(page.locator('#hubTabs [data-hub-tab="events"]')).toHaveAttribute("aria-current", "page");
    await expect(page.locator("#appEventDetail .app-detail-more")).toHaveAttribute("href", /event-signup\.html\?event=evt-later/);

    await page.goBack();
    await expect(page.locator("#appDrill")).toBeHidden();
    await expect(page.locator("[data-hub-panel='events']")).toHaveClass(/hub-on/);
    await expect(page.locator("#hubMemberEventList")).toContainText("Float Build Saturday");
    await expect(page).toHaveURL(/members\.html/);
    expect(await page.evaluate(() => document.body.classList.contains("hub-app"))).toBe(true);
    assertHealthy(expect, report, "event detail from home and events");
  });

  test("an event the member already RSVP'd does not offer a fresh RSVP", async ({ page }) => {
    const report = watchPage(page);
    await openApp(page);
    await page.evaluate((next) => {
      window.__kosHubSetFeed({
        profile: { first_name: "Maeve", last_name: "Kelly", email: "maeve@example.com" },
        events: [next]
      });
    }, Object.assign({}, NEXT, { rsvpd: true }));
    await page.locator('[data-hub-tab="events"]').click();
    const hit = page.locator('#hubMemberEventList [data-app-event="evt-basket"]');
    await expect(hit).toContainText("Already RSVP'd");
    await expect(hit.locator(".app-rsvp")).toHaveClass(/is-going/);
    await hit.locator(".app-event-copy").click();
    await eventDetail(page);
    await expect(page.locator("#appRsvpBtn")).toBeDisabled();
    await expect(page.locator("#appRsvpBtn")).toHaveText("Already RSVP'd");
    await expect(page.locator("#appCancelRsvp")).toHaveText("Cancel RSVP");
    await expect(page.locator("#appCalBtn")).toHaveText("Add to my calendar");
    assertHealthy(expect, report, "already rsvpd detail");
  });

  test("deep link #events/id opens the detail and back returns to the Events list", async ({ page }) => {
    const report = watchPage(page);
    await page.goto("/members.html#events/evt-basket");
    await unlockMemberHub(page, { hash: "events/evt-basket" });
    await page.waitForSelector("#appTop");
    await page.evaluate(({ parade, next }) => {
      window.__kosHubSetFeed({
        profile: { first_name: "Maeve", last_name: "Kelly", email: "maeve@example.com" },
        parades: [parade],
        events: [next]
      });
      if (typeof window.__kosHubSyncRoute === "function") window.__kosHubSyncRoute();
    }, { parade: PARADE, next: NEXT });

    await eventDetail(page);
    await expect(page.locator("#appBackTitle")).toContainText("Tartan Ball Basket Social");
    await expect(page).toHaveURL(/#events\/evt-basket/);

    await page.locator("#appBack").click();
    await expect(page.locator("#appDrill")).toBeHidden();
    await expect(page.locator("[data-hub-panel='events']")).toHaveClass(/hub-on/);
    await expect(page.locator("#appPageTitle")).toHaveText("Events");
    await expect(page.locator("#hubMemberEventList")).toContainText("Tartan Ball Basket Social");
    assertHealthy(expect, report, "event deep link");
  });
});
