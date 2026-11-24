// Charity desk: member volunteer hours roster and pending approvals.
// Mock rows only. The live roster RPC is not called.
const { test, expect } = require("./kos-fixtures");
const fs = require("fs");
const path = require("path");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const SHOTS = "/opt/cursor/artifacts";

function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  return page.screenshot({ path: path.join(SHOTS, name), fullPage: false });
}

const FIXTURE = {
  season_year: 2027,
  seasons: [2027, 2026],
  members: [
    {
      member_id: "m-nia",
      first_name: "Nia",
      last_name: "Byrne",
      name: "Nia Byrne",
      membership_level: "full",
      logs: [
        { id: "n1", member_id: "m-nia", season_year: 2027, worked_on: "2026-09-12", activity: "Basket packing", hours: 8, source: "manual", status: "approved", approved_by: "Moira Quinn" },
        { id: "n2", member_id: "m-nia", season_year: 2027, worked_on: "2026-10-01", activity: "Gift cards for the pantry", hours: 6, source: "in_kind", status: "approved", approved_by: "Moira Quinn" }
      ]
    },
    {
      member_id: "m-patrick",
      first_name: "Patrick",
      last_name: "Doyle",
      name: "Patrick Doyle",
      membership_level: "full",
      logs: [
        { id: "p-ok", member_id: "m-patrick", season_year: 2027, worked_on: "2026-09-12", activity: "Basket packing", hours: 2, source: "manual", status: "approved", approved_by: "Moira Quinn" },
        { id: "p-shift", member_id: "m-patrick", season_year: 2027, worked_on: "2026-10-04", activity: "Float work day", hours: 4, source: "event_signup", status: "approved", event_name: "Float work day", event_id: "e1", approved_by: "Moira Quinn" },
        { id: "p-dup", member_id: "m-patrick", season_year: 2027, worked_on: "2026-10-04", activity: "Float work day", hours: 3, source: "manual", status: "pending", event_name: "Float work day", event_id: "e1", notes: "Entered again after signup." },
        { id: "p-no", member_id: "m-patrick", season_year: 2027, worked_on: "2026-08-01", activity: "Gift cards for the food pantry", hours: 2, source: "in_kind", status: "rejected", approved_by: "Moira Quinn" }
      ]
    },
    {
      member_id: "m-aisling",
      first_name: "Aisling",
      last_name: "Kelly",
      name: "Aisling Kelly",
      membership_level: "associate",
      logs: [
        { id: "a1", member_id: "m-aisling", season_year: 2027, worked_on: "2026-07-04", activity: "Parade staging", hours: 4, source: "manual", status: "approved", approved_by: "Moira Quinn" }
      ]
    },
    {
      member_id: "m-sean",
      first_name: "Sean",
      last_name: "Murphy",
      name: "Sean Murphy",
      membership_level: "full",
      logs: [
        { id: "s1", member_id: "m-sean", season_year: 2027, worked_on: "2026-11-02", activity: "Parade security", hours: 8, source: "door_checkin", status: "pending" }
      ]
    },
    {
      member_id: "m-maeve",
      first_name: "Maeve",
      last_name: "Quinn",
      name: "Maeve Quinn",
      membership_level: "auxiliary",
      logs: [
        { id: "q1", member_id: "m-maeve", season_year: 2027, worked_on: "2026-08-20", activity: "Season hours on file", hours: 2, source: "manual", notes: "One-time season balance entered in the Hub.", status: "approved", approved_by: "Moira Quinn" }
      ]
    },
    {
      member_id: "m-liam",
      first_name: "Liam",
      last_name: "Walsh",
      name: "Liam Walsh",
      membership_level: "loa",
      logs: []
    }
  ]
};

async function openRoster(page) {
  await unlockMemberHub(page, {
    role: { officer: true, canReviewVolunteerInquiries: true }
  });
  await page.evaluate((data) => window.__kosHubSetCharityHours(data), FIXTURE);
  await page.locator("[data-hub-tab='officer']").click();
  const section = page.locator("#deskOff-charity");
  await expect(section).toBeVisible();
  await expect(section).toContainText("Member volunteer hours");
  await expect(section).toContainText("Volunteer inquiries");
  await page.locator('[data-tool="tool:hubCharityHours"]').click();
  const card = page.locator("#hubCharityHours");
  await expect(card).toBeVisible();
  await expect(card.locator("#hubCharityPending")).toBeVisible();
  return card;
}

test.describe("Charity member volunteer hours", () => {
  test("regular members do not get the roster", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, { role: { officer: false, canReviewVolunteerInquiries: false, canReviewCharityHours: false } });
    await expect(page.locator("[data-hub-tab='officer']")).toBeHidden();
    await expect(page.locator("#hubCharityHours")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Patrick Doyle");
    assertHealthy(expect, report, "member cannot open charity hours");
  });

  test("officers who do not see Charity do not get the roster", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, { role: { officer: true, canReviewVolunteerInquiries: false, canReviewCharityHours: false } });
    await page.locator("[data-hub-tab='officer']").click();
    await expect(page.locator('[data-tool="tool:hubCharityHours"]')).toHaveCount(0);
    await expect(page.locator("#hubCharityHours")).toHaveCount(0);
    assertHealthy(expect, report, "roster hidden without charity access");
  });

  test("desktop roster, expanded member, and pending approvals", async ({ page }) => {
    const report = watchPage(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    const card = await openRoster(page);
    await expect(card).toContainText("June 2026 through May 2027");
    await expect(card).toContainText("Pending approvals");
    await expect(card).toContainText("Patrick Doyle");
    await expect(card).toContainText("Sean Murphy");
    await expect(card).toContainText("Possible duplicate of an approved log");
    await expect(card.locator("[data-charity-pending='p-dup']")).toContainText("Approve");
    await expect(card.locator("[data-charity-pending='p-dup']")).toContainText("Reject");
    await expect(card.locator("[data-charity-pending='s1']")).toContainText("Shift");
    const copy = await card.innerText();
    expect(copy).not.toContain("\u2014");
    expect(copy).not.toContain("\u2013");

    await card.locator("[data-charity-pending='p-dup']").evaluate(function (el) {
      el.scrollIntoView({ block: "start", inline: "nearest" });
    });
    await shot(page, "charity-hours-pending-desktop.png");

    await card.locator("#hubCharityRoster").evaluate(function (el) {
      el.scrollIntoView({ block: "start", inline: "nearest" });
    });
    await expect(card.locator("[data-charity-member='m-nia']")).toContainText("12 hour goal met");
    await expect(card.locator("[data-charity-member='m-patrick']")).toContainText("6 hours still needed");
    await expect(card.locator("[data-charity-member='m-patrick']")).toContainText("$72");
    await expect(card.locator("[data-charity-member='m-sean']")).toContainText("$144");
    await expect(card.locator("[data-charity-member='m-aisling']")).toContainText("Associate");
    await expect(card.locator("[data-charity-member='m-aisling']")).toContainText("not required");
    await expect(card.locator("[data-charity-member='m-maeve']")).toContainText("Auxiliary");
    await expect(card.locator("[data-charity-member='m-liam']")).toContainText("LOA");
    await shot(page, "charity-hours-roster-desktop.png");

    await card.locator("[data-charity-filter='under']").click();
    await expect(card.locator("[data-charity-member='m-nia']")).toHaveCount(0);
    await expect(card.locator("[data-charity-member='m-patrick']")).toBeVisible();
    await expect(card.locator("[data-charity-member='m-aisling']")).toHaveCount(0);
    await card.locator("[data-charity-filter='met']").click();
    await expect(card.locator("[data-charity-member='m-nia']")).toBeVisible();
    await expect(card.locator("[data-charity-member='m-patrick']")).toHaveCount(0);
    await card.locator("[data-charity-filter='pending']").click();
    await expect(card.locator("[data-charity-member='m-patrick']")).toBeVisible();
    await expect(card.locator("[data-charity-member='m-sean']")).toBeVisible();
    await expect(card.locator("[data-charity-member='m-liam']")).toHaveCount(0);
    await card.locator("[data-charity-filter='all']").click();
    await card.locator("#hubCharitySearch").fill("Maeve");
    await expect(card.locator("[data-charity-member]")).toHaveCount(1);
    await expect(card.locator("[data-charity-member='m-maeve']")).toBeVisible();
    await card.locator("#hubCharitySearch").fill("");
    await card.locator("#hubCharitySort").selectOption("hours");
    const order = await card.locator(".hub-charity-summary .nm").allTextContents();
    expect(order[0]).toBe("Nia Byrne");
    await card.locator("#hubCharitySeason").selectOption("2026");
    await expect(card.locator("[data-charity-member='m-nia']")).toContainText("0 approved");
    await card.locator("#hubCharitySeason").selectOption("2027");

    const downloadPromise = page.waitForEvent("download");
    await card.locator("#hubCharityCsv").click();
    const download = await downloadPromise;
    const csv = fs.readFileSync(await download.path(), "utf8");
    expect(csv).toContain("Nia Byrne");
    expect(csv).toContain("Not required");
    expect(csv).toContain("June 2026 through May 2027");
    expect(csv).not.toContain("\u2014");

    await card.locator("[data-charity-toggle='m-patrick']").click();
    const logs = card.locator("#hubCharityLogs");
    await expect(logs).toBeVisible();
    await expect(logs).toContainText("Oct 4, 2026");
    await expect(logs).toContainText("Float work day");
    await expect(logs).toContainText("Shift");
    await expect(logs).toContainText("In-kind");
    await expect(logs).toContainText("Approved by Moira Quinn");
    await expect(logs).toContainText("Rejected by Moira Quinn");
    await expect(logs).toContainText("Possible duplicate of an approved log");
    await expect(logs.locator("[data-charity-approve='p-dup']")).toBeVisible();
    await logs.evaluate(function (el) {
      el.scrollIntoView({ block: "start", inline: "nearest" });
    });
    await shot(page, "charity-hours-expanded-desktop.png");

    await card.locator("[data-charity-pending='s1'] [data-charity-approve='s1']").click();
    await expect(card.locator("#hubCharityFlash")).toContainText("Approved Sean Murphy");
    await expect(card.locator("[data-charity-pending='s1']")).toHaveCount(0);
    await expect(card.locator("[data-charity-member='m-sean']")).toContainText("8 approved");
    await expect(card.locator("[data-charity-member='m-sean']")).toContainText("4 hours still needed");

    await card.locator("[data-charity-reject='p-dup']").first().click();
    await expect(card.locator("#hubCharityFlash")).toContainText("Rejected Patrick Doyle");
    await expect(card.locator("[data-charity-pending='p-dup']")).toHaveCount(0);
    await expect(logs).toContainText("Rejected");
    assertHealthy(expect, report, "desktop charity hours");
  });

  test("phone roster, expanded member, and pending approvals", async ({ page }) => {
    const report = watchPage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const card = await openRoster(page);
    const box = await card.boundingBox();
    expect(box.width).toBeLessThanOrEqual(390);
    await card.locator("[data-charity-pending='p-dup']").evaluate(function (el) {
      el.scrollIntoView({ block: "start", inline: "nearest" });
    });
    await expect(card.locator("[data-charity-approve='p-dup']").first()).toBeVisible();
    await shot(page, "charity-hours-pending-phone.png");
    await card.locator("[data-charity-member='m-patrick']").evaluate(function (el) {
      el.scrollIntoView({ block: "center", inline: "nearest" });
    });
    await expect(card.locator("[data-charity-member='m-patrick']")).toContainText("Full");
    await shot(page, "charity-hours-roster-phone.png");
    await card.locator("[data-charity-toggle='m-patrick']").click();
    await card.locator("#hubCharityLogs").evaluate(function (el) {
      el.scrollIntoView({ block: "start", inline: "nearest" });
    });
    await expect(card.locator("#hubCharityLogs")).toContainText("Possible duplicate");
    await expect(card.locator("[data-charity-reject='p-dup']").first()).toBeVisible();
    await shot(page, "charity-hours-expanded-phone.png");
    const overflow = await page.evaluate(() => {
      const el = document.getElementById("hubCharityHours");
      return el.scrollWidth <= document.documentElement.clientWidth + 1;
    });
    expect(overflow).toBe(true);
    assertHealthy(expect, report, "phone charity hours");
  });
});
