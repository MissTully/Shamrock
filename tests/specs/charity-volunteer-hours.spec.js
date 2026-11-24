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
        { id: "p-dup", member_id: "m-patrick", season_year: 2027, worked_on: "2026-10-04", activity: "Float work day", hours: 3, source: "manual", status: "approved", event_name: "Float work day", event_id: "e1", notes: "Entered again after signup." },
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
        { id: "s1", member_id: "m-sean", season_year: 2027, worked_on: "2026-11-02", activity: "Parade security", hours: 8, source: "door_checkin", status: "approved" }
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
  await expect(card.locator("#hubCharityRoster")).toBeVisible();
  await expect(card.locator("[data-charity-approve]")).toHaveCount(0);
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

  test("desktop roster shows logged hours and a possible duplicate", async ({ page }) => {
    const report = watchPage(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    const card = await openRoster(page);
    await expect(card).toContainText("June 2026 through May 2027");
    await expect(card).not.toContainText("Pending approvals");
    await expect(card).toContainText("Patrick Doyle");
    await expect(card).toContainText("Sean Murphy");
    await expect(card.locator("[data-charity-approve], [data-charity-reject]")).toHaveCount(0);
    const copy = await card.innerText();
    expect(copy).not.toContain("\u2014");
    expect(copy).not.toContain("\u2013");

    await card.locator("#hubCharityRoster").evaluate(function (el) {
      el.scrollIntoView({ block: "start", inline: "nearest" });
    });
    await expect(card.locator("[data-charity-member='m-nia']")).toContainText("14 logged");
    await expect(card.locator("[data-charity-member='m-nia']")).toContainText("12 hour goal met");
    await expect(card.locator("[data-charity-member='m-patrick']")).toContainText("9 logged");
    await expect(card.locator("[data-charity-member='m-patrick']")).toContainText("3 hours still needed");
    await expect(card.locator("[data-charity-member='m-patrick']")).toContainText("$36");
    await expect(card.locator("[data-charity-member='m-sean']")).toContainText("8 logged");
    await expect(card.locator("[data-charity-member='m-sean']")).toContainText("$48");
    await expect(card.locator("[data-charity-member='m-aisling']")).toContainText("Associate");
    await expect(card.locator("[data-charity-member='m-aisling']")).toContainText("not required");
    await expect(card.locator("[data-charity-member='m-maeve']")).toContainText("Auxiliary");
    await expect(card.locator("[data-charity-member='m-liam']")).toContainText("LOA");
    await shot(page, "charity-roster-desktop.png");

    await card.locator("[data-charity-filter='under']").click();
    await expect(card.locator("[data-charity-member='m-nia']")).toHaveCount(0);
    await expect(card.locator("[data-charity-member='m-patrick']")).toBeVisible();
    await expect(card.locator("[data-charity-member='m-aisling']")).toHaveCount(0);
    await card.locator("[data-charity-filter='met']").click();
    await expect(card.locator("[data-charity-member='m-nia']")).toBeVisible();
    await expect(card.locator("[data-charity-member='m-patrick']")).toHaveCount(0);
    await card.locator("[data-charity-filter='duplicate']").click();
    await expect(card.locator("[data-charity-member='m-patrick']")).toBeVisible();
    await expect(card.locator("[data-charity-member='m-sean']")).toHaveCount(0);
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
    await expect(card.locator("[data-charity-member='m-nia']")).toContainText("0 logged");
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
    await expect(logs).toContainText("Possible duplicate of another log");
    await expect(logs.locator("[data-charity-approve], [data-charity-reject]")).toHaveCount(0);
    await logs.evaluate(function (el) {
      el.scrollIntoView({ block: "start", inline: "nearest" });
    });
    await shot(page, "charity-roster-expanded-desktop.png");
    assertHealthy(expect, report, "desktop charity hours");
  });

  test("phone roster, expanded member, and pending approvals", async ({ page }) => {
    const report = watchPage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const card = await openRoster(page);
    const box = await card.boundingBox();
    expect(box.width).toBeLessThanOrEqual(390);
    await card.locator("[data-charity-member='m-patrick']").evaluate(function (el) {
      el.scrollIntoView({ block: "center", inline: "nearest" });
    });
    await expect(card.locator("[data-charity-member='m-patrick']")).toContainText("9 logged");
    await expect(card.locator("[data-charity-approve], [data-charity-reject]")).toHaveCount(0);
    await shot(page, "charity-roster-phone.png");
    await card.locator("[data-charity-toggle='m-patrick']").click();
    await card.locator("#hubCharityLogs").evaluate(function (el) {
      el.scrollIntoView({ block: "start", inline: "nearest" });
    });
    await expect(card.locator("#hubCharityLogs")).toContainText("Possible duplicate");
    await expect(card.locator("[data-charity-reject]")).toHaveCount(0);
    await shot(page, "charity-roster-expanded-phone.png");
    const overflow = await page.evaluate(() => {
      const el = document.getElementById("hubCharityHours");
      return el.scrollWidth <= document.documentElement.clientWidth + 1;
    });
    expect(overflow).toBe(true);
    assertHealthy(expect, report, "phone charity hours");
  });

  test("member hours card and How to Play no longer ask for officer review", async ({ page }) => {
    const report = watchPage(page);
    await page.route("**/rest/v1/badge_defs**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );
    await unlockMemberHub(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    const hours = page.locator("#hubHoursCard");
    await hours.scrollIntoViewIfNeeded();
    await expect(hours).toContainText("Hours count as soon as you save them");
    await expect(hours).not.toContainText("awaiting officer review");
    await expect(hours).not.toContainText("officer confirms");
    await shot(page, "member-hours-card-desktop.png");
    await page.setViewportSize({ width: 390, height: 844 });
    await hours.evaluate(function (el) { el.scrollIntoView({ block: "start", inline: "nearest" }); });
    await shot(page, "member-hours-card-phone.png");

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => { window.openGame(); window.gameTab("howto"); });
    const howto = page.locator("#gameBody");
    await expect(howto).toContainText("How to earn Clovers");
    await expect(howto).toContainText("Priority shift bonus");
    await expect(howto).toContainText("Logging hours does not add Clovers");
    await expect(howto).not.toContainText("Volunteer at an event");
    await expect(howto).not.toContainText("30 Clovers");
    await shot(page, "craic-howto-desktop.png");
    await page.setViewportSize({ width: 390, height: 844 });
    await howto.evaluate(function (el) { el.scrollIntoView({ block: "start", inline: "nearest" }); });
    await shot(page, "craic-howto-phone.png");
    assertHealthy(expect, report, "hours card and how to play");
  });

  test("a slower season response does not replace the season on screen", async ({ page }) => {
    const report = watchPage(page);
    const card = await openRoster(page);
    await page.evaluate(function () {
      function emptyQuery() {
        var query = Promise.resolve({ data: [], error: null });
        ["select", "eq", "order", "in", "limit", "neq"].forEach(function (name) {
          query[name] = function () { return query; };
        });
        return query;
      }
      window.__kosSb = {
        from: function () { return emptyQuery(); },
        rpc: function (name, args) {
          if (name !== "list_charity_volunteer_hours") {
            return Promise.resolve({ data: null, error: null });
          }
          var season = Number(args && args.p_season);
          var delay = season === 2026 ? 300 : 30;
          return new Promise(function (resolve) {
            setTimeout(function () {
              resolve({
                error: null,
                data: {
                  ok: true,
                  season_year: season,
                  seasons: [2027, 2026],
                  members: [{
                    member_id: "m-live",
                    first_name: "Live",
                    last_name: "Member",
                    name: "Live Member",
                    membership_level: "full",
                    logs: season === 2027 ? [{
                      id: "live-1",
                      member_id: "m-live",
                      season_year: 2027,
                      worked_on: "2026-09-01",
                      activity: "Basket packing",
                      hours: 9,
                      source: "manual",
                      status: "approved"
                    }] : []
                  }]
                }
              });
            }, delay);
          });
        }
      };
      window.__kosHubCharityHoursLive();
    });
    await card.locator("#hubCharitySeason").selectOption("2026");
    await card.locator("#hubCharitySeason").selectOption("2027");
    await expect(card.locator("[data-charity-member='m-live']")).toContainText("9 logged");
    await page.waitForTimeout(400);
    await expect(card.locator("#hubCharitySeason")).toHaveValue("2027");
    await expect(card.locator("[data-charity-member='m-live']")).toContainText("9 logged");
    await expect(card.locator("[data-charity-member='m-live']")).not.toContainText("0 logged");
    assertHealthy(expect, report, "charity season race");
  });
});
