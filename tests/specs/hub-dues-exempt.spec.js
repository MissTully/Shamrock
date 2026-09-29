// Officers and board members are not shown a dues invoice. Regular members are.
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

  test("a regular member sees Pay dues on the phone and on Parade Ready", async ({ page }) => {
    const report = watchPage(page);
    await openPhone(page, {
      first_name: "Maeve",
      last_name: "Kelly",
      email: "maeve@example.com",
      member_role: "member",
      officer_title: ""
    });
    await expect(page.locator('.app-tile[data-app-go="dues"]')).toBeVisible();
    await expect(page.locator("#hubDuesCheck")).toContainText("Pay membership dues");
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
    await expect(status.locator(".pr-pay")).toContainText("Pay member dues");
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
    await expect(status.locator("#prDuesExempt")).toContainText("not invoiced for dues");
    assertHealthy(expect, report, "officer dues exempt");
  });

  test("a board member does not see a dues invoice", async ({ page }) => {
    const report = watchPage(page);
    await openPhone(page, {
      first_name: "Lisa",
      last_name: "Sugrue",
      email: "lsugrue99@gmail.com",
      member_role: "board",
      officer_title: "Board Member · Committee Chair of Membership",
      roles: ["board", "committee"]
    });
    await expect(page.locator('.app-tile[data-app-go="dues"]')).toHaveCount(0);
    await expect(page.locator("#hubDuesCheck")).toHaveCount(0);
    await page.evaluate(() => {
      window.__kosPreviewParadeReady({
        member_id: "m-lisa",
        dues_paid: false,
        waiver_signed: false,
        meeting_attended: false
      }, false);
    });
    await page.locator("[data-hub-tab='parade']").click();
    await expect(page.locator("#prStatus .pr-pay")).toHaveCount(0);
    await expect(page.locator("#prDuesExempt")).toBeVisible();
    assertHealthy(expect, report, "board dues exempt");
  });
});
