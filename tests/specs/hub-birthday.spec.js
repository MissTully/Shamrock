// Happy Birthday card on Member Hub home.
// Offline: roster rows are injected through __kosHubSetBirthdays, with an
// explicit America/New_York month+day so the suite does not depend on the clock.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const TODAY = { month: 9, day: 24 };

const ROWS = [
  { first_name: "Maeve", last_name: "Kelly", birthday: "1981-09-24", membership_status: "active", email: "maeve@example.com", phone: "813-555-0100" },
  { first_name: "Sean", last_name: "Callahan", birthday: "1974-09-24", membership_status: "pending-renewal" },
  { first_name: "Sean", last_name: "O'Brien", birthday: "1990-09-24", membership_status: "pending-new" },
  { first_name: "Sean", last_name: "O'Malley", birthday: "1988-09-24", membership_status: "active" },
  { first_name: "Nia", last_name: "Walsh", birthday: "2001-09-25", membership_status: "active" },
  { first_name: "Pat", last_name: "Merged", birthday: "1970-09-24", membership_status: "active", merged_into: "kept-id" },
  { first_name: "Lapsed", last_name: "Lee", birthday: "1970-09-24", membership_status: "lapsed" },
  { first_name: "Gone", last_name: "Inactive", birthday: "1970-09-24", membership_status: "inactive" }
];

async function openHome(page) {
  await unlockMemberHub(page);
  await page.waitForSelector('[data-hub-goto="directory"]');
}

test.describe("Member Hub birthday card", () => {
  test("lists today's celebrants by first name and never the year", async ({ page }) => {
    const report = watchPage(page);
    await openHome(page);
    await page.evaluate(({ rows, today }) => window.__kosHubSetBirthdays(rows, today), { rows: ROWS, today: TODAY });

    const card = page.locator("#hubBirthdayCard");
    await expect(card).toBeVisible();
    await expect(card.locator("h3")).toHaveText(/Happy Birthday/);
    await expect(card).toContainText("September 24");
    await expect(card).toContainText("Maeve");
    const names = card.locator(".hub-birthday-names li");
    await expect(names).toHaveText(["Maeve", "Sean C.", "Sean O'Brien", "Sean O'Malley"]);
    const text = await card.innerText();
    expect(text).not.toMatch(/\b(19|20)\d{2}\b/);
    expect(text).not.toMatch(/@|813-555/);
    expect(text).not.toContain("Nia");
    expect(text).not.toContain("Merged");
    expect(text).not.toContain("Lapsed");
    expect(text).not.toContain("Inactive");

    const order = await page.locator("#hubHomeTop").innerHTML();
    expect(order.indexOf("hubBirthdayCard")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("hubBirthdayCard")).toBeLessThan(order.indexOf("hubWelcomeCard"));
    assertHealthy(expect, report, "birthday card");
  });

  test("uses a single celebratory line when only one member matches", async ({ page }) => {
    const report = watchPage(page);
    await openHome(page);
    await page.evaluate((today) => {
      window.__kosHubSetBirthdays([
        { first_name: "Maeve", last_name: "Kelly", birthday: "1981-09-24", membership_status: "active" }
      ], today);
    }, TODAY);
    const card = page.locator("#hubBirthdayCard");
    await expect(card).toBeVisible();
    await expect(card.locator("h3")).toHaveText("🎂 Happy Birthday, Maeve!");
    await expect(card.locator(".hub-birthday-names")).toHaveCount(0);
    expect(await card.innerText()).not.toMatch(/\b(19|20)\d{2}\b/);
    assertHealthy(expect, report, "one birthday");
  });

  test("hides the card when nobody has a birthday today", async ({ page }) => {
    const report = watchPage(page);
    await openHome(page);
    await page.evaluate((today) => window.__kosHubSetBirthdays([
      { first_name: "Nia", last_name: "Walsh", birthday: "2001-01-02", membership_status: "active" }
    ], today), TODAY);
    await expect(page.locator("#hubBirthdayCard")).toHaveCount(0);
    await expect(page.locator("#hubWelcomeCard")).toBeVisible();
    assertHealthy(expect, report, "no birthdays");
  });

  test("matches month and day in America/New_York, including leap day", async ({ page }) => {
    const report = watchPage(page);
    await openHome(page);
    const result = await page.evaluate(() => {
      const ny = window.__kosNyTodayParts;
      const match = window.__kosBirthdaysToday;
      const row = { first_name: "Feb", last_name: "Leap", birthday: "2000-02-29", membership_status: "active" };
      return {
        beforeMidnight: ny(new Date("2026-09-24T03:30:00Z")),
        afterMidnight: ny(new Date("2026-09-24T04:30:00Z")),
        newYearEve: ny(new Date("2026-01-01T04:30:00Z")),
        newYear: ny(new Date("2026-01-01T05:30:00Z")),
        leapOn: match([row], { month: 2, day: 29 }),
        leapOff: match([row], { month: 2, day: 28 })
      };
    });
    expect(result.beforeMidnight).toEqual({ month: 9, day: 23 });
    expect(result.afterMidnight).toEqual({ month: 9, day: 24 });
    expect(result.newYearEve).toEqual({ month: 12, day: 31 });
    expect(result.newYear).toEqual({ month: 1, day: 1 });
    expect(result.leapOn).toEqual(["Feb"]);
    expect(result.leapOff).toEqual([]);
    assertHealthy(expect, report, "birthday timezone");
  });
});
