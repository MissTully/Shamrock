// Elected officers are not shown a dues invoice. Board, captains, and chairs are.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const PARADE = {
  id: "parade-gasparilla",
  name: "Gasparilla Parade of Pirates",
  event_type: "parade",
  start_time: "2027-01-30T19:00:00.000Z",
  location: "Bayshore Boulevard, Tampa"
};

async function openPhone(page, profile) {
  await unlockMemberHub(page);
  await page.waitForSelector("#appDash");
  await page.evaluate(({ profile, parade }) => {
    window.__kosHubSetFeed({
      profile: profile,
      parades: [parade],
      events: [],
      paradeReady: { dues_paid: false, waiver_signed: false, meeting_attended: false },
      membershipStatus: "active"
    });
  }, { profile, parade: PARADE });
}

test.describe("Dues checklist exemption", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("a regular member sees Renew on the phone and on Parade Ready", async ({ page }) => {
    const report = watchPage(page);
    await openPhone(page, {
      first_name: "Maeve",
      last_name: "Kelly",
      email: "maeve@example.com",
      member_role: "member",
      officer_title: ""
    });
    const dues = page.locator('.app-tile[data-app-go="dues"]');
    await expect(dues).toBeVisible();
    await expect(dues).toContainText("Renew");
    await expect(page.locator("#hubDuesCheck")).toHaveCount(0);
    await dues.click();
    await expect(page.locator("#appSheet")).toBeVisible();
    await expect(page.locator("#appSheet")).toContainText("Renew my membership");
    await expect(page.locator("#appSheet")).toContainText("$375");
    await page.locator("#appSheetClose").click();
    await page.evaluate(() => {
      window.__kosPreviewParadeReady({
        member_id: "m-maeve",
        dues_paid: false,
        waiver_signed: false,
        meeting_attended: false
      }, false);
    });
    await page.locator("[data-hub-tab='parade']").click();
    const status = page.locator("#prStatus");
    await expect(status.locator(".pr-pay")).toHaveCount(0);
    await expect(status.locator("#prRenewMount")).toContainText("Renew my membership");
    await expect(status.locator("#prRenewMount")).toContainText("$375");
    await expect(status.locator("#prRenewMount")).toContainText("Leave of absence");
    await expect(status.locator("#prRenewMount")).toContainText("treasurer@kreweofshamrock.com");
    await expect(status).toContainText("not the join application fee");
    assertHealthy(expect, report, "member dues checklist");
  });

  test("an officer does not see a dues invoice", async ({ page }) => {
    const report = watchPage(page);
    await openPhone(page, {
      first_name: "Tim",
      last_name: "Fitzpatrick",
      email: "tim@example.com",
      member_role: "officer",
      officer_title: "President",
      roles: ["officer"]
    });
    await expect(page.locator('.app-tile[data-app-go="dues"]')).toHaveCount(0);
    await expect(page.locator("#hubDuesCheck")).toHaveCount(0);
    await page.evaluate(() => {
      window.__kosPreviewParadeReady({
        member_id: "m-tim",
        dues_paid: false,
        waiver_signed: true,
        meeting_attended: false
      }, false);
    });
    await page.locator("[data-hub-tab='parade']").click();
    const status = page.locator("#prStatus");
    await expect(status.locator(".pr-pay")).toHaveCount(0);
    await expect(status.locator("#prDuesExempt")).toContainText("exempt from dues under the bylaws");
    assertHealthy(expect, report, "officer dues exempt");
  });

  async function seesRenewCard(page, profile, label) {
    const report = watchPage(page);
    await openPhone(page, profile);
    await expect(page.locator('.app-tile[data-app-go="dues"]')).toBeVisible();
    await expect(page.locator("#prDuesExempt")).toHaveCount(0);
    assertHealthy(expect, report, label);
  }

  test("a board member, a captain, and a committee chair are not exempt", async ({ page }) => {
    await seesRenewCard(page, {
      first_name: "Jane",
      last_name: "Sample",
      email: "jane.sample@example.com",
      member_role: "board",
      officer_title: "Board Member",
      roles: ["board"]
    }, "board owes dues");
  });

  test("a captain is not exempt", async ({ page }) => {
    await seesRenewCard(page, {
      first_name: "Pat",
      last_name: "Example",
      email: "pat.example@example.com",
      member_role: "captain",
      officer_title: "Captain",
      roles: ["captain"]
    }, "captain owes dues");
  });

  test("a committee chair is not exempt", async ({ page }) => {
    await seesRenewCard(page, {
      first_name: "Robin",
      last_name: "Example",
      email: "robin.example@example.com",
      member_role: "member",
      officer_title: "Committee Chair of Membership",
      roles: ["committee"]
    }, "chair owes dues");
  });

  test("a vice president is exempt", async ({ page }) => {
    const report = watchPage(page);
    await openPhone(page, {
      first_name: "Alex",
      last_name: "Example",
      email: "alex.example@example.com",
      member_role: "officer",
      officer_title: "Vice President · Committee Chair of Bylaws",
      roles: ["officer"]
    });
    await expect(page.locator('.app-tile[data-app-go="dues"]')).toHaveCount(0);
    await page.evaluate(() => {
      window.__kosPreviewParadeReady({
        member_id: "m-alex",
        dues_paid: false,
        waiver_signed: false,
        meeting_attended: false
      }, false);
    });
    await page.locator("[data-hub-tab='parade']").click();
    await expect(page.locator("#prDuesExempt")).toContainText("exempt from dues under the bylaws");
    assertHealthy(expect, report, "vice president exempt");
  });
});
