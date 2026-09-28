// Phone-app Member Hub shell. Offline fixtures stand in for roster,
// parade, and event rows so this never writes to the live database.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const PARADE = {
  id: "parade-gasparilla",
  name: "Gasparilla Parade of Pirates",
  event_type: "parade",
  start_time: "2027-01-30T19:00:00.000Z",
  location: "Bayshore Boulevard, Tampa",
  members_only: true,
  parade_rsvpd: false,
  parade_checked_in: false,
  eligible: false,
  notes: "March with the castle float."
};

const NEXT = {
  id: "evt-basket",
  name: "Tartan Ball Basket Social",
  event_type: "social",
  start_time: "2026-10-03T17:00:00.000Z",
  location: "Higgins Hall",
  members_only: true,
  status: "published",
  source: "krewe"
};

async function openApp(page, extra) {
  await unlockMemberHub(page, extra || {});
  await page.waitForSelector("#appTop");
  await page.waitForSelector("#appDash");
}

test.describe("Member Hub phone app shell", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("signed-in home uses the app header, countdown, tiles, and bottom tabs", async ({ page }) => {
    const report = watchPage(page);
    await openApp(page);
    await page.evaluate(({ parade, next }) => {
      window.__kosHubSetFeed({
        profile: { first_name: "Maeve", last_name: "Kelly", email: "maeve@example.com", parade_since: "2014" },
        parades: [parade],
        events: [next],
        paradeReady: { dues_paid: true, waiver_signed: true, meeting_attended: false }
      });
    }, { parade: PARADE, next: NEXT });

    await expect(page.locator("body")).toHaveClass(/hub-app/);
    await expect(page.locator("nav.krewe-nav")).toBeHidden();
    await expect(page.locator("#appGreet")).toHaveText(/Good (morning|afternoon|evening)/);
    await expect(page.locator("#appPageTitle")).toHaveText("Home");
    await expect(page.locator("#appAv")).toHaveText("MK");
    await expect(page.locator(".app-hero h2")).toHaveText("Gasparilla Parade of Pirates");
    await expect(page.locator("#appCount")).toContainText("Days");
    await expect(page.locator("#appCount")).toContainText("Hours");
    await expect(page.locator("#appCount")).toContainText("Min");
    await expect(page.locator("#appCount")).toContainText("Sec");
    await expect(page.locator("#appCdDays")).not.toHaveText("");
    await expect(page.locator("#appNextUp")).toContainText("Tartan Ball Basket Social");
    await expect(page.locator("#appNextUp")).toContainText("Higgins Hall");
    await expect(page.locator("#appNextUp .app-rsvp")).toHaveAttribute("data-app-event", "evt-basket");

    const labels = ["Member Card", "RSVP", "Pay Dues", "Chat", "Carpool", "Volunteer", "Shop", "Photos"];
    for (const label of labels) {
      await expect(page.locator(".app-tile", { hasText: label })).toBeVisible();
    }
    await expect(page.locator('.app-tile[data-app-go="chat"]')).toContainText("Coming soon");

    await expect(page.locator('#hubTabs [data-hub-tab="hub"]')).toContainText("Home");
    await expect(page.locator('#hubTabs [data-hub-tab="events"]')).toContainText("Events");
    await expect(page.locator('#hubTabs [data-hub-tab="parade"]')).toContainText("Parade");
    await expect(page.locator('#hubTabs [data-hub-tab="krewe"]')).toContainText("Me");
    await expect(page.locator('#hubTabs [data-hub-tab="officer"]')).toBeHidden();

    const dashText = await page.locator("#appDash").innerText();
    expect(dashText).not.toMatch(/[—–]/);
    assertHealthy(expect, report, "app home shell");
  });

  test("chat tile stays on Home and does not leave the hub", async ({ page }) => {
    const report = watchPage(page);
    await openApp(page);
    await page.locator('.app-tile[data-app-go="chat"]').click();
    await expect(page.locator("[data-hub-panel='hub']")).toHaveClass(/hub-on/);
    await expect(page.locator("#appToast")).toContainText("Chat is coming soon");
    await expect(page).toHaveURL(/members\.html/);
    assertHealthy(expect, report, "chat coming soon");
  });

  test("member card, dues, RSVP, and carpool use real hub destinations", async ({ page }) => {
    const report = watchPage(page);
    await openApp(page);
    await page.evaluate((parade) => {
      window.__kosHubSetFeed({
        profile: { first_name: "Maeve", last_name: "Kelly", email: "maeve@example.com", officer_title: "Member", parade_since: "2014" },
        parades: [parade],
        paradeReady: { dues_paid: true, waiver_signed: true, meeting_attended: true },
        membershipStatus: "active"
      });
    }, PARADE);

    await page.locator('.app-tile[data-app-go="card"]').click();
    const card = page.locator("#appDrill");
    await expect(card).toBeVisible();
    await expect(page.locator("#appBack")).toBeVisible();
    await expect(card).toContainText("Krewe of Shamrock");
    await expect(card).toContainText("Maeve Kelly");
    await expect(card).toContainText("Good standing");
    await expect(card).toContainText("Parade Ready");
    await expect(card).toContainText("Marching since 2014");
    await page.locator("#appBack").click();
    await expect(card).toBeHidden();
    const sheet = page.locator("#appSheet");

    await page.locator('.app-tile[data-app-go="dues"]').click();
    await expect(sheet.locator('a[href*="krewe-of-shamrock-membership"]')).toHaveCount(2);
    await expect(sheet.locator('a[href="https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership"]')).toBeVisible();
    await expect(sheet.locator('a[href="https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership-2"]')).toBeVisible();
    await page.locator("#appSheetClose").click();

    await page.locator('.app-tile[data-app-go="events"]').click();
    await expect(page.locator("[data-hub-panel='events']")).toHaveClass(/hub-on/);
    await expect(page.locator("#appPageTitle")).toHaveText("Events");

    await page.locator('[data-hub-tab="hub"]').click();
    await page.locator('.app-tile[data-app-go="carpool"]').click();
    await expect(page.locator("[data-hub-panel='parade']")).toHaveClass(/hub-on/);
    await expect(page.locator("#carpoolCard")).toBeVisible();

    await page.locator('[data-hub-tab="krewe"]').click();
    await expect(page.locator("#appPageTitle")).toHaveText("Me");
    await expect(page.locator("#appMeLinks a[href='gallery.html']")).toBeVisible();
    await expect(page.locator("#appMeLinks a[href='store.html']")).toBeVisible();
    await expect(page.locator("#appMeLinks a[href='faq.html']")).toBeVisible();
    await expect(page.locator('#appMeLinks [data-app-go="signout"]')).toBeVisible();
    await expect(page.locator("#hubMemberDirectory")).toBeVisible();
    assertHealthy(expect, report, "app destinations");
  });

  test("officer tab shows for officers and keeps the applications count", async ({ page }) => {
    const report = watchPage(page);
    await openApp(page, {
      role: {
        officer: true,
        canReviewApplications: true,
        applications: [
          { id: "1", first_name: "Nia", last_name: "Byrne", membership_status: "pending-new", email: "nia@example.com", created_at: "2026-09-28T15:00:00.000Z" },
          { id: "2", first_name: "Owen", last_name: "Kelly", membership_status: "pending-new", email: "owen@example.com", created_at: "2026-09-20T15:00:00.000Z" },
          { id: "3", first_name: "Aoife", last_name: "Walsh", membership_status: "pending-new", email: "aoife@example.com", created_at: "2026-09-10T15:00:00.000Z" }
        ]
      }
    });
    const officer = page.locator('[data-hub-tab="officer"]');
    await expect(officer).toBeVisible();
    await expect(officer).toContainText("Officer");
    await expect(page.locator("#appOfficerBadge")).toHaveText("3");
    await officer.click();
    await expect(page.locator("[data-hub-panel='officer']")).toHaveClass(/hub-on/);
    await expect(page.locator("#appPageTitle")).toHaveText("Officer");
    await expect(page.locator("#hubOfficerHero")).toBeVisible();
    assertHealthy(expect, report, "officer tab");
  });
});
