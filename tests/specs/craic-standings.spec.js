// Craic Cup standings no longer include the Top Volunteers rank list.
// Mock leaderboard rows only. This does not call the live volunteer view.
const { test, expect } = require("./kos-fixtures");
const fs = require("fs");
const path = require("path");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const SHOTS = "/opt/cursor/artifacts";

function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  return page.screenshot({ path: path.join(SHOTS, name), fullPage: false });
}

const SEASON = [
  { place: 1, member_id: "m1", first_name: "Nia", last_name: "Byrne", rank_icon: "☘️", rank_name: "Clansfolk", season_clovers: 120, badge_count: 1 },
  { place: 2, member_id: "m2", first_name: "Patrick", last_name: "Doyle", rank_icon: "🌱", rank_name: "Newcomer", season_clovers: 40, badge_count: 0 }
];
const BADGES = [
  { id: "first", name: "First RSVP", icon: "🎟️", description: "Your first RSVP", sort: 1 }
];
const BADGE_BOARD = [
  { place: 1, member_id: "m1", first_name: "Nia", last_name: "Byrne", badge_count: 1, badge_ids: ["first"] }
];

function json(route, body) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body)
  });
}

test.describe("Craic Cup standings without a volunteer rank list", () => {
  test("desktop and phone standings keep season Clovers and drop the volunteer board", async ({ page }) => {
    const report = watchPage(page);
    let volunteerBoardHits = 0;
    page.on("request", (req) => {
      if (req.url().includes("v_volunteer_leaderboard")) volunteerBoardHits += 1;
    });
    await page.route("**/rest/v1/v_season_leaderboard**", (route) => json(route, SEASON));
    await page.route("**/rest/v1/badge_defs**", (route) => json(route, BADGES));
    await page.route("**/rest/v1/v_badge_leaderboard**", (route) => json(route, BADGE_BOARD));

    await page.setViewportSize({ width: 1280, height: 900 });
    await unlockMemberHub(page);
    const card = page.locator(".game-head");
    await expect(card).toContainText("Volunteer hours are tracked on your Volunteer hours card");
    await expect(card).toContainText("No officer approval");
    await expect(card).not.toContainText("Volunteer bonuses");
    await expect(card).not.toContainText("show up, volunteer");

    await page.evaluate(() => { window.openGame(); window.gameTab("standings"); });
    const body = page.locator("#gameBody");
    await expect(body).toContainText("Season Standings");
    await expect(body).toContainText("Nia Byrne");
    await expect(body).toContainText("Patrick Doyle");
    await expect(body).toContainText("Badge Leaderboard");
    await expect(body).toContainText("Volunteer hours are tracked on your Volunteer hours card");
    await expect(body).toContainText("No officer approval");
    await expect(body).not.toContainText("Top Volunteers");
    await expect(body).not.toContainText("service gets its own podium");
    await expect(body).not.toContainText("Volunteer 🍀");
    await expect(body).not.toContainText("Shifts");
    await shot(page, "craic-standings-desktop.png");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#gameModal .modal-card").evaluate((el) => {
      el.scrollIntoView({ block: "start", inline: "nearest" });
    });
    await expect(body).toContainText("Season Standings");
    await expect(body).not.toContainText("Top Volunteers");
    await shot(page, "craic-standings-phone.png");

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => { window.gameTab("howto"); });
    await expect(body).toContainText("Priority shift bonus");
    await expect(body).toContainText("Logging hours does not add Clovers");
    await expect(body).not.toContainText("Volunteer at an event");
    expect(volunteerBoardHits).toBe(0);
    assertHealthy(expect, report, "craic standings without volunteer board");
  });
});
