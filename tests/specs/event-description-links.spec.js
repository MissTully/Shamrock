// Description URLs are real links on the public event page and in the Hub.
const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const URL = "https://metromin.volunteerhub.com/vv2/lp/KreweofShamrock/";
const DESCRIPTION = "Sign up to volunteer with the Krewe at Metropolitan Ministries: " + URL;
const SHOTS = process.env.KOS_SHOT_DIR || "/opt/cursor/artifacts";

const METRO = {
  id: "fixture-metro",
  name: "Metropolitan Ministries",
  description: DESCRIPTION,
  event_type: "fundraiser",
  start_time: "2026-12-12T15:00:00.000Z",
  end_time: "2026-12-12T19:00:00.000Z",
  location: "Tampa",
  status: "published",
  is_public: true,
  source: "krewe",
  members_only: false,
  external_url: URL
};

async function noHorizontalOverflow(page) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(extra).toBeLessThanOrEqual(1);
}

test.describe("event description links", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Metropolitan Ministries style link is an anchor on the public page and in the Hub", async ({ page }) => {
    const report = watchPage(page);
    await page.goto("/events/fixture-metro");
    const desc = page.locator(".share-desc a.kos-url");
    await expect(desc).toHaveCount(1);
    await expect(desc).toHaveAttribute("href", URL);
    await expect(desc).toHaveAttribute("target", "_blank");
    await expect(desc).toHaveAttribute("rel", "noopener noreferrer");
    await expect(desc).toHaveText(URL);
    const button = page.locator(".share-actions a", { hasText: "Event link" });
    await expect(button).toHaveAttribute("href", URL);
    await expect(button).toHaveAttribute("target", "_blank");
    await expect(page.locator("body")).not.toContainText("javascript:");
    await noHorizontalOverflow(page);

    await page.setViewportSize({ width: 344, height: 700 });
    await noHorizontalOverflow(page);
    await page.setViewportSize({ width: 884, height: 900 });
    await noHorizontalOverflow(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await desc.scrollIntoViewIfNeeded();
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({
      path: path.join(SHOTS, "public-event-description-link-390.png"),
      fullPage: false
    });

    await unlockMemberHub(page);
    await page.waitForSelector("#appTop");
    await page.evaluate((ev) => {
      window.__kosHubSetFeed({
        profile: { first_name: "Maeve", last_name: "Kelly", email: "maeve@example.com" },
        events: [ev],
        paradeReady: { dues_paid: true, waiver_signed: true, meeting_attended: true },
        membershipStatus: "active"
      });
      if (typeof window.__kosHubSyncRoute === "function") window.__kosHubSyncRoute();
    }, METRO);
    await page.locator('[data-hub-tab="events"]').click();
    const card = page.locator("#hubMemberEventList .hub-ev-card");
    const hubLink = card.locator(".hub-ev-desc a.kos-url");
    await expect(hubLink).toHaveAttribute("href", URL);
    await expect(hubLink).toHaveAttribute("target", "_blank");
    await expect(hubLink).toHaveAttribute("rel", "noopener noreferrer");
    await expect(card.locator("a.hub-ev-btn-alt", { hasText: "Event website" })).toHaveAttribute("href", URL);
    await noHorizontalOverflow(page);
    await hubLink.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(SHOTS, "hub-event-card-description-link-390.png"),
      fullPage: false
    });

    await card.locator(".app-event-copy").click();
    const detail = page.locator("#appEventDetail");
    await expect(detail.locator("a.kos-url", { hasText: "metromin.volunteerhub.com" })).toHaveAttribute("href", URL);
    await expect(detail.locator("a", { hasText: "Event link" })).toHaveAttribute("href", URL);
    assertHealthy(expect, report, "event description links");
  });

  test("Officer Desk description preview linkifies as you type", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, { role: { officer: true, canManageEvents: true } });
    const tile = page.locator('.app-tile[data-app-go="event-studio"]');
    await tile.click();
    await expect(page.locator("#hubEventDescription")).toBeVisible();
    await page.locator("#hubEventDescription").fill(
      "More info: https://www.egyptshriners.com/feztival-of-trees."
    );
    const preview = page.locator("#hubEventDescPreview a.kos-url");
    await expect(preview).toHaveAttribute("href", "https://www.egyptshriners.com/feztival-of-trees");
    await expect(preview).toHaveAttribute("target", "_blank");
    await expect(page.locator("#hubEventDescPreview")).toContainText(".");
    await expect(preview).not.toHaveText(/trees\.$/);
    assertHealthy(expect, report, "officer description preview");
  });
});
